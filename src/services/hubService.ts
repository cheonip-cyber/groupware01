import { supabase } from './supabaseClient';

// 업무자동화(앱 허브) 데이터 접근 (2026-07-28)
// 기존 그룹웨어 테이블과 완전히 분리된 신규 테이블(hub_apps / hub_comments)만 사용한다.
// 기존 dataSource를 건드리지 않도록 별도 모듈로 둔다.

export interface HubApp {
  id: number;
  name: string;
  description: string;
  category: string;
  tags: string;
  url: string;
  registrant: string;
  clickCount: number;
  commentCount: number;
  createdAt: string;
}

export interface HubComment {
  id: number;
  appId: number;
  content: string;
  author: string;
  createdAt: string;
}

export interface HubAppInput {
  name: string;
  description: string;
  category: string;
  tags: string;
  url: string;
  registrant: string;
}

/** update/delete가 0건 처리돼도 error가 null인 문제를 막기 위해 반영 건수를 확인한다 */
function ensureAffected(rows: unknown[] | null, what: string) {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}: 변경이 반영되지 않았습니다(0건). 권한 또는 대상을 확인해주세요.`);
  }
}

export async function listApps(): Promise<HubApp[]> {
  const { data, error } = await supabase
    .from('hub_apps')
    .select('id, name, description, category, tags, url, registrant, click_count, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((a: any) => a.id);
  // 댓글 수는 별도 집계 (뷰를 새로 만들지 않고 클라이언트에서 합산)
  const counts = new Map<number, number>();
  if (ids.length > 0) {
    const { data: cs, error: cErr } = await supabase
      .from('hub_comments').select('app_id').in('app_id', ids);
    if (cErr) throw cErr;
    for (const c of cs ?? []) counts.set(c.app_id, (counts.get(c.app_id) ?? 0) + 1);
  }

  return (data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    category: a.category ?? '기타',
    tags: a.tags ?? '',
    url: a.url,
    registrant: a.registrant ?? '',
    clickCount: a.click_count ?? 0,
    commentCount: counts.get(a.id) ?? 0,
    createdAt: a.created_at,
  }));
}

export async function createApp(input: HubAppInput, userId?: string): Promise<void> {
  const { error } = await supabase.from('hub_apps').insert({
    name: input.name, description: input.description, category: input.category,
    tags: input.tags, url: input.url, registrant: input.registrant, created_by: userId ?? null,
  });
  if (error) throw error;
}

export async function updateApp(id: number, input: HubAppInput): Promise<void> {
  const { data, error } = await supabase.from('hub_apps').update({
    name: input.name, description: input.description, category: input.category,
    tags: input.tags, url: input.url, registrant: input.registrant,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id');
  if (error) throw error;
  ensureAffected(data, '앱 수정');
}

export async function deleteApp(id: number): Promise<void> {
  const { data, error } = await supabase.from('hub_apps').delete().eq('id', id).select('id');
  if (error) throw error;
  ensureAffected(data, '앱 삭제');
}

/** 실행 횟수 +1 — 실행 흐름을 막지 않도록 실패해도 조용히 넘어간다 */
export async function bumpClick(id: number, current: number): Promise<void> {
  await supabase.from('hub_apps').update({ click_count: current + 1 }).eq('id', id);
}

export async function listComments(appId: number): Promise<HubComment[]> {
  const { data, error } = await supabase
    .from('hub_comments').select('id, app_id, content, author, created_at')
    .eq('app_id', appId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id, appId: c.app_id, content: c.content, author: c.author ?? '', createdAt: c.created_at,
  }));
}

export async function addComment(appId: number, content: string, author: string, userId?: string): Promise<void> {
  const { error } = await supabase.from('hub_comments')
    .insert({ app_id: appId, content, author, created_by: userId ?? null });
  if (error) throw error;
}
