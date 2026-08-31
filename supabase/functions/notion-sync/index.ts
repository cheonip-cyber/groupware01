// notion-sync Edge Function (v32 - archive_notion_page callable by logged-in frontend users)
// 변경점(v30→v31): 그룹웨어에서 프로젝트/강사를 삭제해도 노션 원본 페이지는 그대로 살아있으면,
// 다음 pull 때 그 페이지가 다시 감지되어 "새 페이지"로 재생성(부활)되는 구조적 결함 발견
// (2026-08-28, 사용자가 그룹웨어에서 삭제한 프로젝트가 다시 나타나는 걸 발견해 신고).
// 원인: deleteProject()는 그룹웨어 DB만 지우고 노션 페이지는 안 건드림 → 노션 원본이 살아있는
// 채로 남아 다음 동기화 때 notion_page_id로 기존 행을 못 찾아(이미 삭제됐으니) 새로 INSERT됨.
// 수정: archive_notion_page 액션 신설 — 그룹웨어 삭제 직전에 프론트에서 이 액션을 먼저 호출해
// 노션 페이지를 archived:true(휴지통)로 만든다. 이러면 이후 pull 쿼리 결과에서 자동 제외되어
// 다시는 재생성되지 않는다.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RECENT_RELINK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30일

const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN')!;
const NOTION_VERSION = '2022-06-28';

const ENTITY_CONFIG: Record<string, { table: string; databaseId: string }> = {
  project: { table: 'projects', databaseId: 'd3bf9b4d-f51c-44ab-8d79-3f97e7967313' },
  instructor: { table: 'instructors', databaseId: 'a8c32f5f-99cc-4769-a560-f32c83259c9d' },
};
const CREATE_IF_MISSING = new Set(['instructor', 'project']);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'groupware' } });

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const a = e as Record<string, unknown>;
    if (a.message) {
      let m = String(a.message);
      if (a.details) m += ` (${a.details})`;
      if (a.code) m += ` [${a.code}]`;
      return m;
    }
    try { return JSON.stringify(e); } catch { return String(e); }
  }
  return String(e);
}

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
    const err: any = new Error(`Notion API ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function checkPageAlive(pageId: string): Promise<boolean> {
  try {
    const page = await notionFetch(`/pages/${pageId}`);
    if (page?.archived === true || page?.in_trash === true) return false;
    return true;
  } catch (e: any) {
    if (e?.status === 404) return false;
    throw e;
  }
}

async function archiveNotionPage(entityType: string, id: number) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { error: `unknown entity_type: ${entityType}` };
  const { data: row, error } = await supabase.from(cfg.table).select('id, notion_page_id').eq('id', id).maybeSingle();
  if (error || !row) return { skipped: true, reason: 'row not found' };
  if (!row.notion_page_id) return { skipped: true, reason: 'not linked to notion' };
  try {
    const alive = await checkPageAlive(row.notion_page_id);
    if (!alive) {
      await logSync(entityType, id, 'to_notion', 'success', `노션 페이지 이미 삭제 상태 확인(${row.notion_page_id})`);
      return { alreadyGone: true };
    }
    await notionFetch(`/pages/${row.notion_page_id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    await logSync(entityType, id, 'to_notion', 'success', `그룹웨어 삭제에 따라 노션 페이지 휴지통 이동(${row.notion_page_id})`);
    return { archived: true };
  } catch (e) {
    const msg = errMsg(e);
    await logSync(entityType, id, 'to_notion', 'error', `노션 페이지 휴지통 이동 실패: ${msg}`);
    return { error: msg };
  }
}

async function verifyLinks(limit = 25) {
  let checked = 0, missingFound = 0, recovered = 0, errored = 0;
  for (const table of ['projects', 'instructors']) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('id, notion_page_id, notion_missing')
      .not('notion_page_id', 'is', null)
      .order('notion_missing_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;
    for (const row of rows ?? []) {
      try {
        const alive = await checkPageAlive(row.notion_page_id);
        await supabase.from(table).update({
          notion_missing: !alive,
          notion_missing_checked_at: new Date().toISOString(),
        }).eq('id', row.id);
        checked++;
        if (!alive) missingFound++;
        if (alive && row.notion_missing) recovered++;
      } catch (_e) {
        errored++;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return { checked, missingFound, recovered, errored };
}

type DataType = 'title' | 'status' | 'select' | 'checkbox' | 'date' | 'number' | 'rich_text' | 'multi_select' | 'email' | 'phone_number' | 'people' | 'relation';

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
  rich_text: 'rich_text', multi_select: 'multi_select', email: 'email', phone_number: 'phone_number', people: 'people', relation: 'relation',
};

const NO_WRITE_TYPES = new Set<DataType>(['people', 'relation']);

const YEAR_PROP = '교육년도';
const MONTH_PROP = '매출월';
const INSTRUCTOR_RELATION_PROP = '강사섭외';
function monthNumToNotionName(mm: string): string { return `${parseInt(mm, 10)}월`; }
function monthNameToNum(name: string): string | null {
  const n = parseInt(name.replace('월', ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? String(n).padStart(2, '0') : null;
}
function yearNumToNotionName(yyyy: string): string { return `${yyyy}년`; }
function yearNameToNum(name: string): string | null {
  const n = parseInt(name.replace('년', ''), 10);
  return Number.isFinite(n) ? String(n) : null;
}

function buildNotionPropertyValue(value: unknown, dataType: DataType) {
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
    default: return undefined;
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
    case 'people': return { value: (prop.people ?? []).map((u: any) => u.name).filter(Boolean).join(', ') || null };
    case 'relation': return { value: (prop.relation ?? []).map((r: any) => r.id) };
  }
}

const norm = (v: unknown) => {
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  return v === null || v === undefined ? '' : String(v);
};

async function logSync(entityType: string, entityId: number | null, direction: 'to_notion' | 'from_notion', status: 'success' | 'error', message: string) {
  await supabase.from('notion_sync_log').insert({ entity_type: entityType, entity_id: entityId, direction, status, message });
}

async function getSyncState(key: string): Promise<string | null> {
  const { data } = await supabase.from('sync_state').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

async function setSyncState(key: string, value: string) {
  await supabase.from('sync_state').upsert({ key, value, updated_at: new Date().toISOString() });
}

async function fetchPageTitle(pageId: string): Promise<string> {
  const p = await notionFetch(`/pages/${pageId}`);
  for (const k of Object.keys(p.properties ?? {})) {
    if (p.properties[k]?.type === 'title') {
      return (p.properties[k].title ?? []).map((x: any) => x.plain_text).join('');
    }
  }
  return '';
}

async function resolveClientId(pageIds: string[]): Promise<number | null> {
  if (pageIds.length === 0) return null;
  try {
    const name = (await fetchPageTitle(pageIds[0])).trim();
    if (!name) return null;
    const { data: existing } = await supabase.from('clients').select('id').eq('name', name).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error: insErr } = await supabase.from('clients').insert({ name }).select('id').single();
    if (insErr) return null;
    return created?.id ?? null;
  } catch {
    return null;
  }
}

async function syncProjectInstructors(projectRowId: number, instructorPageIds: string[]) {
  try {
    let instructorIds: number[] = [];
    if (instructorPageIds.length > 0) {
      const { data: rows } = await supabase
        .from('instructors')
        .select('id')
        .in('notion_page_id', instructorPageIds);
      instructorIds = (rows ?? []).map((r: any) => r.id);
    }
    await supabase.from('project_instructors').delete().eq('project_id', projectRowId);
    if (instructorIds.length > 0) {
      await supabase.from('project_instructors').insert(
        instructorIds.map((instructor_id) => ({ project_id: projectRowId, instructor_id }))
      );
    }
  } catch (_e) {
    // no-op
  }
}

async function createNotionPage(entityType: string, row: any, allMappings: FieldMapping[]) {
  const cfg = ENTITY_CONFIG[entityType];
  const properties: Record<string, any> = {};
  for (const m of allMappings) {
    if (m.sync_direction === 'disabled' || NO_WRITE_TYPES.has(m.data_type)) continue;
    const v = row[m.supabase_column];
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === '') continue;
    const built = buildNotionPropertyValue(v, m.data_type);
    if (built !== undefined) properties[m.notion_property_name] = built;
  }
  if (entityType === 'project' && row.revenue_month) {
    const [yyyy, mm] = String(row.revenue_month).split('-');
    if (yyyy && mm) {
      properties[YEAR_PROP] = { select: { name: yearNumToNotionName(yyyy) } };
      properties[MONTH_PROP] = { select: { name: monthNumToNotionName(mm) } };
    }
  }
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: cfg.databaseId }, properties }),
  });
  const backfill: Record<string, unknown> = {
    notion_page_id: page.id,
    sync_status: 'synced', sync_error: null, last_synced_at: new Date().toISOString(),
    notion_missing: false, notion_missing_checked_at: new Date().toISOString(),
  };
  if (entityType === 'project') { backfill.notion_url = page.url; }
  const { error: backErr } = await supabase.from(cfg.table).update(backfill).eq('id', row.id);
  if (backErr) {
    throw new Error(`노션 페이지는 생성됐으나 연결 역저장 실패: ${errMsg(backErr)} (page ${page.id})`);
  }
  return page;
}

async function pushEntity(entityType: string, id: number) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { error: `unknown entity_type: ${entityType}` };

  const mappings = await getActiveMappings(entityType);
  const pushMappings = mappings.filter((m) => (m.sync_direction === 'both' || m.sync_direction === 'to_notion_only') && !NO_WRITE_TYPES.has(m.data_type));

  const { data: row, error } = await supabase.from(cfg.table).select('*').eq('id', id).maybeSingle();
  if (error || !row) return { skipped: true, reason: 'row not found' };

  if (!row.notion_page_id) {
    if (!CREATE_IF_MISSING.has(entityType)) return { skipped: true, reason: 'no notion_page_id linked' };
    try {
      const page = await createNotionPage(entityType, row, mappings);
      await logSync(entityType, id, 'to_notion', 'success', `created notion page ${page.id}`);
      return { created: true, pageId: page.id };
    } catch (e) {
      const msg = errMsg(e);
      await supabase.from(cfg.table).update({ sync_status: 'error', sync_error: msg }).eq('id', id);
      await logSync(entityType, id, 'to_notion', 'error', `노션 페이지 생성 실패: ${msg}`);
      return { error: msg };
    }
  }

  let page: any;
  try {
    page = await notionFetch(`/pages/${row.notion_page_id}`);
  } catch (e) {
    const msg = errMsg(e);
    await supabase.from(cfg.table).update({ sync_status: 'error', sync_error: msg }).eq('id', id);
    await logSync(entityType, id, 'to_notion', 'error', msg);
    return { error: msg };
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
      const built = buildNotionPropertyValue(target, m.data_type);
      if (built !== undefined) { properties[m.notion_property_name] = built; anyChanged = true; }
    }
  }

  if (entityType === 'project' && row.revenue_month) {
    const [yyyy, mm] = String(row.revenue_month).split('-');
    if (yyyy && mm) {
      const wantYear = yearNumToNotionName(yyyy);
      const wantMonth = monthNumToNotionName(mm);
      const curYear = page.properties?.[YEAR_PROP]?.select?.name ?? null;
      const curMonth = page.properties?.[MONTH_PROP]?.select?.name ?? null;
      if (curYear !== wantYear) { properties[YEAR_PROP] = { select: { name: wantYear } }; anyChanged = true; }
      if (curMonth !== wantMonth) { properties[MONTH_PROP] = { select: { name: wantMonth } }; anyChanged = true; }
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
    const msg = errMsg(e);
    await supabase.from(cfg.table).update({ sync_status: 'error', sync_error: msg }).eq('id', id);
    await logSync(entityType, id, 'to_notion', 'error', msg);
    return { error: msg };
  }
}

async function pullEntity(entityType: string) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { error: `unknown entity_type: ${entityType}` };

  const mappings = await getActiveMappings(entityType);
  const pullMappings = mappings.filter((m) => m.sync_direction === 'both' || m.sync_direction === 'from_notion_only');
  const titleMapping = mappings.find((m) => m.data_type === 'title');

  const cursorKey = `pull_cursor_${entityType}`;
  const stored = await getSyncState(cursorKey);
  const scanStart = new Date().toISOString();
  const OVERLAP_MS = 60 * 1000;
  const sinceMs = stored ? new Date(stored).getTime() - OVERLAP_MS : Date.now() - 10 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();

  let created = 0, updated = 0, skipped = 0, errored = 0, scanned = 0;
  let startCursor: string | undefined = undefined;

  for (let batch = 0; batch < 20; batch++) {
    const body: Record<string, unknown> = {
      filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } },
      page_size: 100,
    };
    if (startCursor) body.start_cursor = startCursor;
    const result = await notionFetch(`/databases/${cfg.databaseId}/query`, { method: 'POST', body: JSON.stringify(body) });
    scanned += (result.results ?? []).length;

    for (const page of result.results ?? []) {
      try {
        const patch: Record<string, any> = {};
        const fieldErrors: string[] = [];

        for (const m of pullMappings) {
          const read = readNotionPropertyValue(page.properties, m);
          if (read.missing) { fieldErrors.push(`속성 없음: "${m.notion_property_name}"`); continue; }
          if (read.typeMismatch) { fieldErrors.push(`타입 불일치: "${m.notion_property_name}"`); continue; }
          if (m.data_type === 'relation') {
            const ids: string[] = read.value ?? [];
            if (m.supabase_column === 'client_id') {
              patch[m.supabase_column] = await resolveClientId(ids);
            } else {
              const names: string[] = [];
              for (const rid of ids.slice(0, 5)) {
                try { const t = await fetchPageTitle(rid); if (t) names.push(t); } catch {}
              }
              patch[m.supabase_column] = names.join(', ') || null;
            }
          } else {
            patch[m.supabase_column] = read.value;
          }
        }

        if (entityType === 'project') {
          const monthName = page.properties?.[MONTH_PROP]?.select?.name ?? null;
          if (monthName) {
            let yearName = page.properties?.[YEAR_PROP]?.select?.name ?? null;
            if (!yearName) {
              const sessionDate = ['교육일자(1차수)', '교육일자(2차수)', '교육일자(3차수)', '교육일자(4차수)', '교육일자(5차수)']
                .map((k) => page.properties?.[k]?.date?.start).find((d: string | undefined) => !!d);
              yearName = sessionDate ? `${sessionDate.slice(0, 4)}년` : `${new Date().getFullYear()}년`;
            }
            const yyyy = yearNameToNum(yearName);
            const mm = monthNameToNum(monthName);
            if (yyyy && mm) patch.revenue_month = `${yyyy}-${mm}`;
          }
        }

        const { data: existing } = await supabase.from(cfg.table).select('id, *').eq('notion_page_id', page.id).maybeSingle();

        const instructorPageIds: string[] = entityType === 'project'
          ? (page.properties?.[INSTRUCTOR_RELATION_PROP]?.relation ?? []).map((r: any) => r.id)
          : [];

        if (existing) {
          const changed = Object.keys(patch).some((k) => norm(patch[k]) !== norm((existing as any)[k]));
          const needsUrlBackfill = entityType === 'project' && !(existing as any).notion_url;

          if (!changed && fieldErrors.length === 0 && !needsUrlBackfill) {
            if ((existing as any).sync_status === 'error') {
              await supabase.from(cfg.table).update({ sync_status: 'synced', sync_error: null }).eq('id', existing.id);
            }
            if (entityType === 'project') await syncProjectInstructors(existing.id, instructorPageIds);
            skipped++;
            continue;
          }

          const { error: updErr } = await supabase.from(cfg.table).update({
            ...patch, last_synced_at: new Date().toISOString(),
            ...(entityType === 'project' ? { notion_url: page.url } : {}),
            sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
            sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
          }).eq('id', existing.id);
          if (updErr) throw updErr;
          if (entityType === 'project') await syncProjectInstructors(existing.id, instructorPageIds);
          await logSync(entityType, existing.id, 'from_notion', fieldErrors.length > 0 ? 'error' : 'success', fieldErrors.join(' / ') || 'updated from notion');
          updated++;
        } else {
          const titleValue = titleMapping ? patch[titleMapping.supabase_column] : null;
          if (!titleValue) { skipped++; continue; }

          const { data: nameDup } = await supabase.from(cfg.table)
            .select('id, notion_page_id, created_at').eq(titleMapping!.supabase_column, titleValue).limit(1);
          if (nameDup && nameDup.length > 0) {
            const dupRow = nameDup[0];
            let dupLinkAlive: boolean | null = null;
            if (dupRow.notion_page_id) {
              try { dupLinkAlive = await checkPageAlive(dupRow.notion_page_id); } catch { dupLinkAlive = null; }
            }
            const dupIsRecent = dupRow.created_at
              ? (Date.now() - new Date(dupRow.created_at).getTime()) < RECENT_RELINK_WINDOW_MS
              : false;
            // 자동 재연결 조건: 링크가 죽어있고(또는 애초에 미연결), 그 행이 최근(30일 이내)에
            // 생성된 경우만. 매년 반복되는 프로젝트는 작년 완료건이 이름만 같고 훨씬 오래전에
            // 생성됐을 것이므로, 이 조건이 그 케이스를 자연히 걸러낸다 — 오래된 행은 링크가
            // 죽어있어도 절대 건드리지 않고 새 행을 생성해 과거 실적을 보존한다.
            if ((!dupRow.notion_page_id || dupLinkAlive === false) && dupIsRecent) {
              const reason = !dupRow.notion_page_id ? '미연결 상태' : '기존 링크가 삭제(휴지통)된 상태로 확인됨';
              await supabase.from(cfg.table).update({
                ...patch,
                notion_page_id: page.id, last_synced_at: new Date().toISOString(), sync_status: 'synced', sync_error: null,
                notion_missing: false, notion_missing_checked_at: new Date().toISOString(),
                ...(entityType === 'project' ? { notion_url: page.url } : {}),
              }).eq('id', dupRow.id);
              if (entityType === 'project') await syncProjectInstructors(dupRow.id, instructorPageIds);
              await logSync(entityType, dupRow.id, 'from_notion', 'success', `기존 행과 자동 재연결(최근 생성분, ${reason}): "${String(titleValue).slice(0, 60)}"`);
              updated++;
              continue;
            }
            if (dupLinkAlive === true) {
              // 링크가 살아있는데 이름이 겹치면 진짜 별개 항목일 수 있으니 생성 보류(안전)
              skipped++;
              await logSync(entityType, dupRow.id, 'from_notion', 'error',
                `생성 보류(이름 중복 가드): "${String(titleValue).slice(0, 80)}" — 기존 행이 이미 살아있는 다른 노션 페이지와 연결되어 있음. 필요 시 수동 확인`);
              continue;
            }
            // 링크는 죽어있지만(또는 미연결) 기존 행이 오래됐음 — 매년 반복되는 프로젝트의
            // 과거 완료 기록일 가능성이 높아 건드리지 않고 새 행으로 생성(아래로 진행).
            await logSync(entityType, dupRow.id, 'from_notion', 'error',
              `이름 중복이지만 기존 행이 오래되어(반복 프로젝트 가능성) 재연결하지 않고 신규 생성: "${String(titleValue).slice(0, 80)}"`);
          }

          const { data: inserted, error: insErr } = await supabase.from(cfg.table).insert({
            ...patch,
            notion_page_id: page.id,
            ...(entityType === 'project' ? { notion_url: page.url, is_master: true, source_type: 'notion' } : {}),
            sync_status: fieldErrors.length > 0 ? 'error' : 'synced',
            sync_error: fieldErrors.length > 0 ? fieldErrors.join(' / ') : null,
            last_synced_at: new Date().toISOString(),
          }).select('id').single();
          if (insErr) throw insErr;
          if (entityType === 'project') await syncProjectInstructors(inserted!.id, instructorPageIds);
          await logSync(entityType, inserted!.id, 'from_notion', fieldErrors.length > 0 ? 'error' : 'success', fieldErrors.join(' / ') || 'created from notion');
          created++;
        }
      } catch (e) {
        errored++;
        await logSync(entityType, null, 'from_notion', 'error', errMsg(e));
      }
    }

    if (!result.has_more) break;
    startCursor = result.next_cursor;
  }

  await setSyncState(cursorKey, scanStart);
  return { entityType, scanned, created, updated, skipped, errored };
}

async function processQueue(limit = 15) {
  const { data: items } = await supabase
    .from('notion_push_queue')
    .select('*')
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(limit);

  let done = 0, failed = 0, rateLimited = false;

  for (const item of items ?? []) {
    await supabase.from('notion_push_queue').update({ status: 'processing' }).eq('id', item.id);
    try {
      const r: any = await pushEntity(item.entity_type, item.entity_id);
      if (r && r.error) throw new Error(r.error);
      await supabase.from('notion_push_queue').update({
        status: 'done', processed_at: new Date().toISOString(), last_error: null,
      }).eq('id', item.id);
      done++;
    } catch (e) {
      const msg = errMsg(e);
      const is429 = msg.includes('429');
      const attempts = (item.attempts ?? 0) + 1;
      const finalFail = !is429 && attempts >= 5;
      const { error: upErr } = await supabase.from('notion_push_queue').update({
        status: finalFail ? 'error' : 'pending',
        attempts, last_error: msg,
      }).eq('id', item.id);
      if (upErr) {
        await supabase.from('notion_push_queue').update({
          status: 'done', processed_at: new Date().toISOString(),
          last_error: `${msg} (신규 대기 항목으로 대체됨)`,
        }).eq('id', item.id);
      }
      failed++;
      if (is429) { rateLimited = true; break; }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return { picked: (items ?? []).length, done, failed, rateLimited };
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('SYNC_SECRET');
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? 'pull';
  // 2026-08-28: archive_notion_page는 그룹웨어 프론트엔드(로그인된 사용자)가 직접 호출한다 —
  // x-sync-secret(크론 전용 비밀값)을 프론트 코드에 넣으면 브라우저 번들에 노출되므로, 이
  // 액션만 예외로 두고 verify_jwt(Supabase 플랫폼 표준 인증, 로그인 세션/anon key)만으로
  // 호출 가능하게 한다. 나머지 액션(pull/push/verify_links 등 대량 작업)은 기존처럼 보호.
  if (secret && action !== 'archive_notion_page' && req.headers.get('x-sync-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  try {
    const entityType = body.entityType ?? 'project';

    if (action === 'whoami') {
      try {
        const me = await notionFetch('/users/me');
        const testId = body.checkDbId ?? ENTITY_CONFIG.project.databaseId;
        let dbAccess: any = null;
        try {
          const db = await notionFetch(`/databases/${testId}`);
          dbAccess = { ok: true, title: db?.title?.[0]?.plain_text ?? null };
        } catch (e: any) {
          dbAccess = { error: errMsg(e), status: e?.status };
        }
        return new Response(JSON.stringify({ tokenValid: true, bot: me, checkedDbId: testId, dbAccess }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ tokenValid: false, error: errMsg(e) }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    if (action === 'push') {
      const result = await pushEntity(entityType, Number(body.entityId ?? body.projectId));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'process_queue') {
      const result = await processQueue(Number(body.limit ?? 15));
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
    if (action === 'archive_notion_page') {
      const result = await archiveNotionPage(entityType, Number(body.entityId ?? body.projectId));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'verify_links') {
      const result = await verifyLinks(Number(body.limit ?? 25));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: errMsg(e) }), { status: 500 });
  }
});
