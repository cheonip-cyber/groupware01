// notion-sync Edge Function (v3 - multi-entity, mapping-table driven)
// Supports: project, instructor (companies intentionally NOT synced - no Notion source)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN')!;
const NOTION_VERSION = '2022-06-28';

const ENTITY_CONFIG: Record<string, { table: string; databaseId: string }> = {
  project: { table: 'projects', databaseId: '2eaa43d0-87d9-81bf-b2ff-cab0c0ee5549' },
  instructor: { table: 'instructors', databaseId: 'a8c32f5f-99cc-4769-a560-f32c83259c9d' },
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'groupware' } });

async function notionFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

type DataType = 'title' | 'status' | 'select' | 'checkbox' | 'date' | 'number' | 'rich_text' | 'multi_select' | 'email' | 'phone_number';

interface FieldMapping {
  id: number;
  entity_type: string;
  supabase_column: string;
  notion_property_name: string;
  data_type: DataType;
  sync_direction: 'both' | 'to_notion_only' | 'from_notion_only' | 'disabled';
}

async function getActiveMappings(entityType: string): Promise<FieldMapping[]> {
  const { data, error } = await supabase
    .from('notion_field_mappings')
    .select('*')
    .eq('entity_type', entityType)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as FieldMapping[];
}

const NOTION_TYPE_NAME: Record<DataType, string> = {
  title: 'title', status: 'status', select: 'select', checkbox: 'checkbox', date: 'date', number: 'number',
  rich_text: 'rich_text', multi_select: 'multi_select', email: 'email', phone_number: 'phone_number',
};

function buildNotionPropertyValue(value: any, dataType: DataType) {
  switch (dataType) {
    case 'title': return { title: [{ text: { content: String(value ?? '') } }] };
    case 'status': return { status: { name: value } };
    case 'select': return value ? { select: { name: value } } : { select: null };
    case 'checkbox': return { checkbox: !!value };
    case 'date': return value ? { date: { start: value } } : { date: null };
    case 'number': return value != null ? { number: Number(value) } : { number: null };
    case 'rich_text': return { rich_text: value ? [{ text: { content: String(value).slice(0, 1900) } }] : [] };
    case 'multi_select': return { multi_select: (Array.isArray(value) ? value : []).map((v: string) => ({ name: v })) };
    case 'email': return { email: value || null };
    case 'phone_number': return { phone_number: value || null };
  }
}

function readNotionPropertyValue(pageProperties: any, mapping: FieldMapping): { value?: any; missing?: boolean; typeMismatch?: boolean } {
  const prop = pageProperties?.[mapping.notion_property_name];
  if (prop === undefined) return { missing: true };
  if (prop.type !== NOTION_TYPE_NAME[mapping.data_type]) return { typeMismatch: true };

  switch (mapping.data_type) {
    case 'title': return { value: prop.title?.[0]?.plain_text ?? null };
    case 'status': return { value: prop.status?.name ?? null };
    case 'select': return { value: prop.select?.name ?? null };
    case 'checkbox': return { value: !!prop.checkbox };
    case 'date': return { value: prop.date?.start ?? null };
    case 'number': return { value: prop.number ?? null };
    case 'rich_text': return { value: (prop.rich_text ?? []).map((t: any) => t.plain_text).join('') || null };
    case 'multi_select': return { value: (prop.multi_select ?? []).map((o: any) => o.name) };
    case 'email': return { value: prop.email ?? null };
    case 'phone_number': return { value: prop.phone_number ?? null };
  }
}

const norm = (v: unknown) => {
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  return v === null || v === undefined ? '' : String(v);
};

async function logSync(entityType: string, entityId: number | null, direction: 'to_notion' | 'from_notion', status: 'success' | 'error', message: string) {
  await supabase.from('notion_sync_log').insert({ entity_type: entityType, entity_id: entityId, direction, status, message });
}

async function pushEntity(entityType: string, id: number) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { error: `unknown entity_type: ${entityType}` };

  const mappings = await getActiveMappings(entityType);
  const pushMappings = mappings.filter((m) => m.sync_direction === 'both' || m.sync_direction === 'to_notion_only');

  const { data: row, error } = await supabase.from(cfg.table).select('*').eq('id', id).maybeSingle();
  if (error || !row) return { skipped: true, reason: 'row not found' };
  if (!row.notion_page_id) return { skipped: true, reason: 'no notion_page_id linked' };

  let page: any;
  try {
    page = await notionFetch(`/pages/${row.notion_page_id}`);
  } catch (e) {
    await supabase.from(cfg.table).update({ sync_status: 'error', sync_error: String(e) }).eq('id', id);
    await logSync(entityType, id, 'to_notion', 'error', String(e));
    return { error: String(e) };
  }

  const properties: Record<string, any> = {};
  const fieldErrors: string[] = [];
  let anyChanged = false;

  for (const m of pushMappings) {
    const target = (row as any)[m.supabase_column];
    const current = readNotionPropertyValue(page.properties, m);

    if (current.missing) {
      fieldErrors.push(`속성 없음: "${m.notion_property_name}" (매핑설정에서 이름 확인 필요)`);
      continue;
    }
    if (current.typeMismatch) {
      fieldErrors.push(`타입 불일치: "${m.notion_property_name}" (설정=${m.data_type}, 실제=${page.properties[m.notion_property_name]?.type})`);
      continue;
    }
    if (norm(target) !== norm(current.value)) {
      properties[m.notion_property_name] = buildNotionPropertyValue(target, m.data_type);
      anyChanged = true;
    }
  }

  if (fieldErrors.length > 0) await logSync(entityType, id, 'to_notion', 'error', fieldErrors.join(' / '));

  if (!anyChanged) {
    await supabase.from(cfg.table).update({
      sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
      sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
      last_synced_at: new Date().toISOString(),
    }).eq('id', id);
    return { skipped: true, reason: 'no diff', fieldErrors };
  }

  try {
    await notionFetch(`/pages/${row.notion_page_id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    await supabase.from(cfg.table).update({
      sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
      sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
      last_synced_at: new Date().toISOString(),
    }).eq('id', id);
    await logSync(entityType, id, 'to_notion', 'success', `pushed (${Object.keys(properties).join(', ')})`);
    return { pushed: true, fields: Object.keys(properties), fieldErrors };
  } catch (e) {
    await supabase.from(cfg.table).update({ sync_status: 'error', sync_error: String(e) }).eq('id', id);
    await logSync(entityType, id, 'to_notion', 'error', String(e));
    return { error: String(e) };
  }
}

async function pullEntity(entityType: string) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { error: `unknown entity_type: ${entityType}` };

  const mappings = await getActiveMappings(entityType);
  const pullMappings = mappings.filter((m) => m.sync_direction === 'both' || m.sync_direction === 'from_notion_only');
  const titleMapping = mappings.find((m) => m.data_type === 'title');

  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const result = await notionFetch(`/databases/${cfg.databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } },
      page_size: 50,
    }),
  });

  let created = 0, updated = 0, skipped = 0, errored = 0;

  for (const page of result.results ?? []) {
    try {
      const patch: Record<string, any> = {};
      const fieldErrors: string[] = [];

      for (const m of pullMappings) {
        const read = readNotionPropertyValue(page.properties, m);
        if (read.missing) { fieldErrors.push(`속성 없음: "${m.notion_property_name}"`); continue; }
        if (read.typeMismatch) { fieldErrors.push(`타입 불일치: "${m.notion_property_name}"`); continue; }
        patch[m.supabase_column] = read.value;
      }

      const { data: existing } = await supabase.from(cfg.table).select('id, *').eq('notion_page_id', page.id).maybeSingle();

      if (existing) {
        const changed = Object.keys(patch).some((k) => norm(patch[k]) !== norm((existing as any)[k]));
        if (!changed && fieldErrors.length === 0) { skipped++; continue; }

        await supabase.from(cfg.table).update({
          ...patch, last_synced_at: new Date().toISOString(),
          sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
          sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
        }).eq('id', existing.id);
        await logSync(entityType, existing.id, 'from_notion', fieldErrors.length > 0 ? 'error' : 'success', fieldErrors.join(' / ') || 'updated from notion');
        updated++;
      } else {
        const titleValue = titleMapping ? patch[titleMapping.supabase_column] : null;
        if (!titleValue) { skipped++; continue; }
        const { data: inserted, error: insErr } = await supabase.from(cfg.table).insert({
          ...patch,
          notion_page_id: page.id,
          ...(entityType === 'project' ? { notion_url: page.url, is_master: true } : {}),
          sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
          sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
          last_synced_at: new Date().toISOString(),
        }).select('id').single();
        if (insErr) throw insErr;
        await logSync(entityType, inserted!.id, 'from_notion', fieldErrors.length > 0 ? 'error' : 'success', fieldErrors.join(' / ') || 'created from notion');
        created++;
      }
    } catch (e) {
      errored++;
      await logSync(entityType, null, 'from_notion', 'error', String(e));
    }
  }
  return { entityType, scanned: (result.results ?? []).length, created, updated, skipped, errored };
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('SYNC_SECRET');
  if (secret && req.headers.get('x-sync-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'pull';
    const entityType = body.entityType ?? 'project';

    if (action === 'push') {
      const result = await pushEntity(entityType, Number(body.entityId ?? body.projectId));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'pull') {
      const result = await pullEntity(entityType);
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'pull_all') {
      const results = [];
      for (const et of Object.keys(ENTITY_CONFIG)) results.push(await pullEntity(et));
      return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
