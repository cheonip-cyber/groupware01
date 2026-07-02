// =============================================================
// notion-sync Edge Function
// - action=push : Postgres 트리거가 호출 (Supabase → Notion, 값이 다를 때만 반영)
// - action=pull : pg_cron이 주기 호출 (Notion → Supabase, 최근 수정분만 조회)
// 매핑 대상: groupware.projects ↔ Notion "Project" 데이터소스
// 매핑 제외(문서화): tax_invoice_date, revenue_month, is_report_completed,
//   payment_info_confirmed, vendor_tax_invoice_*, client_payment_* (Notion에 대응 필드 없음)
// =============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN')!;
const NOTION_VERSION = '2022-06-28';
const PROJECT_DB_ID = '2eaa43d0-87d9-81bf-b2ff-cab0c0ee5549';

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

// ---------- 필드 매핑 (양방향 대응 필드만) ----------
type ProjectRow = Record<string, any>;

function projectToNotionProperties(p: ProjectRow) {
  const dateProp = (v: string | null) => (v ? { date: { start: v } } : { date: null });
  const textProp = (v: string | null) => ({ rich_text: v ? [{ text: { content: String(v).slice(0, 1900) } }] : [] });
  return {
    '작업': { title: [{ text: { content: p.project_name ?? '' } }] },
    '진행 상태': { status: { name: p.status } },
    ...(p.priority ? { '우선순위': { select: { name: p.priority } } } : {}),
    '세금계산서 발행': { checkbox: !!p.is_tax_invoice_issued },
    '거래명세서 제출': { checkbox: !!p.is_statement_submitted },
    '제안서 제출': { checkbox: !!p.is_proposal_submitted },
    '교육일자(1차수)': dateProp(p.session_1_date),
    '교육일자(2차수)': dateProp(p.session_2_date),
    '제안 마감일': dateProp(p.proposal_due_date),
    '제안 제출일': dateProp(p.proposal_submitted_date),
    ...(p.initial_estimate != null ? { '최초견적': { number: Number(p.initial_estimate) } } : {}),
    ...(p.final_estimate != null ? { '현재/최종견적': { number: Number(p.final_estimate) } } : {}),
    '진행사항(주요내용)': textProp(p.progress_notes),
    '기타사항': textProp(p.etc_notes),
  };
}

function notionPageToProjectPatch(page: any) {
  const pr = page.properties ?? {};
  const title = pr['작업']?.title?.[0]?.plain_text ?? null;
  const status = pr['진행 상태']?.status?.name ?? null;
  const priority = pr['우선순위']?.select?.name ?? null;
  const richText = (p: any) => (p?.rich_text ?? []).map((t: any) => t.plain_text).join('') || null;
  return {
    project_name: title,
    status,
    priority,
    is_tax_invoice_issued: !!pr['세금계산서 발행']?.checkbox,
    is_statement_submitted: !!pr['거래명세서 제출']?.checkbox,
    is_proposal_submitted: !!pr['제안서 제출']?.checkbox,
    session_1_date: pr['교육일자(1차수)']?.date?.start ?? null,
    session_2_date: pr['교육일자(2차수)']?.date?.start ?? null,
    proposal_due_date: pr['제안 마감일']?.date?.start ?? null,
    proposal_submitted_date: pr['제안 제출일']?.date?.start ?? null,
    initial_estimate: pr['최초견적']?.number ?? null,
    final_estimate: pr['현재/최종견적']?.number ?? null,
    progress_notes: richText(pr['진행사항(주요내용)']),
    etc_notes: richText(pr['기타사항']),
  };
}

const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v));

async function logSync(entityId: number | null, direction: 'to_notion' | 'from_notion', status: 'success' | 'error', message: string) {
  await supabase.from('notion_sync_log').insert({ entity_type: 'project', entity_id: entityId, direction, status, message });
}

// ---------- PUSH: Supabase → Notion ----------
async function pushProject(id: number) {
  const { data: row, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error || !row) return { skipped: true, reason: 'row not found' };

  if (!row.notion_page_id) {
    // 아직 Notion과 연결되지 않은 프로젝트(레거시 이관분 등)는 이번 단계에서 자동 생성하지 않음(후속 과제)
    return { skipped: true, reason: 'no notion_page_id linked' };
  }

  let page: any;
  try {
    page = await notionFetch(`/pages/${row.notion_page_id}`);
  } catch (e) {
    await supabase.from('projects').update({ sync_status: 'error', sync_error: String(e) }).eq('id', id);
    await logSync(id, 'to_notion', 'error', String(e));
    return { error: String(e) };
  }

  const current = notionPageToProjectPatch(page);
  const target = {
    project_name: row.project_name, status: row.status, priority: row.priority,
    is_tax_invoice_issued: !!row.is_tax_invoice_issued, is_statement_submitted: !!row.is_statement_submitted,
    is_proposal_submitted: !!row.is_proposal_submitted, session_1_date: row.session_1_date, session_2_date: row.session_2_date,
    proposal_due_date: row.proposal_due_date, proposal_submitted_date: row.proposal_submitted_date,
    initial_estimate: row.initial_estimate, final_estimate: row.final_estimate,
    progress_notes: row.progress_notes, etc_notes: row.etc_notes,
  };
  const changed = Object.keys(target).some((k) => norm((target as any)[k]) !== norm((current as any)[k]));

  if (!changed) {
    await supabase.from('projects').update({ sync_status: 'synced', last_synced_at: new Date().toISOString(), sync_error: null }).eq('id', id);
    return { skipped: true, reason: 'no diff' };
  }

  try {
    const properties = projectToNotionProperties(row);
    await notionFetch(`/pages/${row.notion_page_id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    await supabase.from('projects').update({ sync_status: 'synced', last_synced_at: new Date().toISOString(), sync_error: null }).eq('id', id);
    await logSync(id, 'to_notion', 'success', 'pushed');
    return { pushed: true };
  } catch (e) {
    await supabase.from('projects').update({ sync_status: 'error', sync_error: String(e) }).eq('id', id);
    await logSync(id, 'to_notion', 'error', String(e));
    return { error: String(e) };
  }
}

// ---------- PULL: Notion → Supabase ----------
async function pullProjects() {
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3분 전(폴링 주기 1분 대비 여유)
  const result = await notionFetch(`/databases/${PROJECT_DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } },
      page_size: 50,
    }),
  });

  let created = 0, updated = 0, skipped = 0, errored = 0;

  for (const page of result.results ?? []) {
    try {
      const patch = notionPageToProjectPatch(page);
      const { data: existing } = await supabase.from('projects').select('id, *').eq('notion_page_id', page.id).maybeSingle();

      if (existing) {
        const target = { ...patch };
        const currentOnDb = {
          project_name: existing.project_name, status: existing.status, priority: existing.priority,
          is_tax_invoice_issued: !!existing.is_tax_invoice_issued, is_statement_submitted: !!existing.is_statement_submitted,
          is_proposal_submitted: !!existing.is_proposal_submitted, session_1_date: existing.session_1_date,
          session_2_date: existing.session_2_date, proposal_due_date: existing.proposal_due_date,
          proposal_submitted_date: existing.proposal_submitted_date, initial_estimate: existing.initial_estimate,
          final_estimate: existing.final_estimate, progress_notes: existing.progress_notes, etc_notes: existing.etc_notes,
        };
        const changed = Object.keys(target).some((k) => norm((target as any)[k]) !== norm((currentOnDb as any)[k]));
        if (!changed) { skipped++; continue; }

        await supabase.from('projects').update({
          ...patch, last_synced_at: new Date().toISOString(), sync_status: 'synced', sync_error: null,
        }).eq('id', existing.id);
        await logSync(existing.id, 'from_notion', 'success', 'updated from notion');
        updated++;
      } else {
        const { data: inserted, error: insErr } = await supabase.from('projects').insert({
          ...patch,
          notion_page_id: page.id,
          notion_url: page.url,
          is_master: true,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
        }).select('id').single();
        if (insErr) throw insErr;
        await logSync(inserted!.id, 'from_notion', 'success', 'created from notion');
        created++;
      }
    } catch (e) {
      errored++;
      await logSync(null, 'from_notion', 'error', String(e));
    }
  }
  return { scanned: (result.results ?? []).length, created, updated, skipped, errored };
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('SYNC_SECRET');
  if (secret && req.headers.get('x-sync-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'pull';

    if (action === 'push') {
      const result = await pushProject(Number(body.projectId));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    if (action === 'pull') {
      const result = await pullProjects();
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
