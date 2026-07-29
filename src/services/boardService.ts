import { supabase } from './supabaseClient';

// 자료실(파일 게시판) — 업무자동화 메뉴 안에서 사용 (2026-07-28)
// 파일 실체는 Storage 버킷(board-files)에 저장하고 DB에는 메타데이터만 둔다.
// 기존 그룹웨어 테이블·서비스는 건드리지 않는다.

const BUCKET = 'board-files';
/** Supabase Free 요금제 Storage 한도 */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1GB
/** 건당 업로드 한도 — 버킷 설정(file_size_limit)과 같은 값 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
/** 게시글당 첨부 개수 */
export const MAX_FILES_PER_POST = 5;
/** 실행파일 계열은 차단 */
const BLOCKED_EXT = ['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'js', 'vbs', 'sh', 'jar', 'ps1'];

export interface BoardFile {
  id: number;
  postId: number;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
}

export interface BoardPost {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  files: BoardFile[];
}

export interface StorageUsage {
  usedBytes: number;
  fileCount: number;
  limitBytes: number;
  percent: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 확장자 차단 검사 */
export function isBlockedFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return BLOCKED_EXT.includes(ext);
}

export async function getUsage(): Promise<StorageUsage> {
  const { data, error } = await supabase
    .from('board_storage_usage').select('used_bytes, file_count').maybeSingle();
  if (error) throw error;
  const used = Number(data?.used_bytes ?? 0);
  return {
    usedBytes: used,
    fileCount: Number(data?.file_count ?? 0),
    limitBytes: STORAGE_LIMIT_BYTES,
    percent: Math.min(100, Math.round((used / STORAGE_LIMIT_BYTES) * 1000) / 10),
  };
}

export async function listPosts(): Promise<BoardPost[]> {
  const { data, error } = await supabase
    .from('board_posts').select('id, title, content, author, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((p: any) => p.id);
  const byPost = new Map<number, BoardFile[]>();
  if (ids.length > 0) {
    const { data: fs, error: fErr } = await supabase
      .from('board_files').select('id, post_id, file_name, storage_path, size_bytes').in('post_id', ids);
    if (fErr) throw fErr;
    for (const f of fs ?? []) {
      const item: BoardFile = {
        id: f.id, postId: f.post_id, fileName: f.file_name,
        storagePath: f.storage_path, sizeBytes: Number(f.size_bytes ?? 0),
      };
      byPost.set(f.post_id, [...(byPost.get(f.post_id) ?? []), item]);
    }
  }
  return (data ?? []).map((p: any) => ({
    id: p.id, title: p.title, content: p.content ?? '', author: p.author ?? '',
    createdAt: p.created_at, files: byPost.get(p.id) ?? [],
  }));
}

/**
 * 게시글 등록 + 파일 업로드.
 * 한도를 넘기면 업로드 자체를 막는다 — 초과 후 오류보다 사전 차단이 안전하다.
 */
export async function createPost(
  input: { title: string; content: string; author: string },
  files: File[],
  userId?: string,
): Promise<void> {
  if (files.length > MAX_FILES_PER_POST) {
    throw new Error(`첨부는 게시글당 ${MAX_FILES_PER_POST}개까지 가능합니다.`);
  }
  for (const f of files) {
    if (isBlockedFile(f.name)) throw new Error(`허용되지 않는 형식입니다: ${f.name}`);
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`${f.name} — 파일 하나당 ${formatBytes(MAX_FILE_BYTES)}까지 올릴 수 있습니다.`);
    }
  }
  const adding = files.reduce((s, f) => s + f.size, 0);
  const usage = await getUsage();
  if (usage.usedBytes + adding > STORAGE_LIMIT_BYTES) {
    throw new Error(
      `저장 공간이 부족합니다. 남은 용량 ${formatBytes(STORAGE_LIMIT_BYTES - usage.usedBytes)}, `
      + `올리려는 크기 ${formatBytes(adding)}. 오래된 자료를 정리한 뒤 다시 시도해주세요.`,
    );
  }

  const { data: post, error } = await supabase.from('board_posts')
    .insert({ title: input.title, content: input.content, author: input.author, created_by: userId ?? null })
    .select('id').single();
  if (error) throw error;

  const uploaded: string[] = [];
  try {
    for (const f of files) {
      const path = `${post.id}/${Date.now()}_${f.name.replace(/[^\w.\-가-힣]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false });
      if (upErr) throw upErr;
      uploaded.push(path);
      const { error: metaErr } = await supabase.from('board_files').insert({
        post_id: post.id, file_name: f.name, storage_path: path,
        size_bytes: f.size, mime_type: f.type || null,
      });
      if (metaErr) throw metaErr;
    }
  } catch (e) {
    // 일부만 올라간 상태로 남지 않도록 되돌린다
    if (uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from('board_posts').delete().eq('id', post.id);
    throw e;
  }
}

export async function deletePost(post: BoardPost): Promise<void> {
  // 파일 먼저 제거 — 게시글만 지우면 Storage에 파일이 남아 용량을 계속 차지한다
  const paths = post.files.map((f) => f.storagePath);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) throw rmErr;
  }
  const { data, error } = await supabase.from('board_posts').delete().eq('id', post.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('삭제가 반영되지 않았습니다(0건). 권한을 확인해주세요.');
  }
}

/** 비공개 버킷이라 서명 URL로 내려받는다 (10분 유효) */
export async function getDownloadUrl(file: BoardFile): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(file.storagePath, 600, { download: file.fileName });
  if (error) throw error;
  return data.signedUrl;
}
