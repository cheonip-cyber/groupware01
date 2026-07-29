import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../common/toast';
import { useDialog } from '../common/dialog';
import {
  listPosts, createPost, deletePost, getUsage, getDownloadUrl,
  formatBytes, isBlockedFile, MAX_FILE_BYTES, MAX_FILES_PER_POST,
  type BoardPost, type BoardFile, type StorageUsage,
} from '../../services/boardService';

// 자료실 — 업무자동화 화면 안, 앱 카탈로그 아래에 배치 (2026-07-28)
// 스타일은 허브의 .hub-scope 안에서 동작하며, 자료실 전용 클래스만 추가로 쓴다.

function formatDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function BoardSection() {
  const { profile } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const me = profile?.name ?? profile?.email ?? '';

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([listPosts(), getUsage()]);
      setPosts(p); setUsage(u);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '자료실을 불러오지 못했습니다');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  // 팝업 ESC 닫기 — 그룹웨어 전체 규칙과 동일
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const bad = picked.find((f) => isBlockedFile(f.name));
    if (bad) { toast.error(`허용되지 않는 형식입니다: ${bad.name}`); return; }
    const big = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (big) { toast.error(`${big.name} — 파일 하나당 ${formatBytes(MAX_FILE_BYTES)}까지 가능합니다`); return; }
    if (picked.length > MAX_FILES_PER_POST) { toast.error(`첨부는 ${MAX_FILES_PER_POST}개까지 가능합니다`); return; }
    setFiles(picked);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return; }
    setSaving(true);
    try {
      await createPost({ title: title.trim(), content: content.trim(), author: me }, files, profile?.id);
      setOpen(false); setTitle(''); setContent(''); setFiles([]);
      await load();
      toast.success('자료를 등록했습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록하지 못했습니다');
    } finally { setSaving(false); }
  }

  async function remove(post: BoardPost) {
    const size = post.files.reduce((s, f) => s + f.sizeBytes, 0);
    const ok = await dialog.confirm(
      `'${post.title}' 게시글을 삭제할까요?\n첨부 ${post.files.length}건(${formatBytes(size)})도 함께 삭제됩니다.`,
      { tone: 'danger', confirmText: '삭제' });
    if (!ok) return;
    try { await deletePost(post); await load(); toast.success('삭제했습니다'); }
    catch (e) { toast.error(e instanceof Error ? e.message : '삭제하지 못했습니다'); }
  }

  async function download(f: BoardFile) {
    try {
      const url = await getDownloadUrl(f);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { toast.error(e instanceof Error ? e.message : '내려받지 못했습니다'); }
  }

  // 80% 넘으면 주황, 95% 넘으면 빨강 — 한도 도달 전에 알아차릴 수 있게
  const tone = !usage ? 'ok' : usage.percent >= 95 ? 'danger' : usage.percent >= 80 ? 'warn' : 'ok';

  return (
    <section className="catalog board-section" id="board">
      <div className="catalog-head">
        <div>
          <p className="eyebrow"><span>▤</span> SHARED FILES</p>
          <h2>자료실</h2>
          <p className="section-sub">업무 자료를 함께 보관하고 내려받습니다.</p>
        </div>
        <button className="primary-action" onClick={() => setOpen(true)}>자료 등록 ↗</button>
      </div>

      {usage && (
        <div className={`storage-meter tone-${tone}`}>
          <div className="storage-meter-head">
            <span>저장 공간</span>
            <strong>
              {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)} ({usage.percent}%)
            </strong>
          </div>
          <div className="storage-bar"><span style={{ width: `${Math.max(usage.percent, 0.5)}%` }} /></div>
          <p className="storage-note">
            파일 {usage.fileCount}건 · 남은 용량 {formatBytes(usage.limitBytes - usage.usedBytes)}
            {tone !== 'ok' && ' · 오래된 자료를 정리해주세요'}
          </p>
        </div>
      )}

      {loading ? <p className="board-empty">불러오는 중…</p>
        : posts.length === 0 ? <p className="board-empty">아직 등록된 자료가 없습니다.</p>
        : (
          <ul className="board-list">
            {posts.map((p) => (
              <li key={p.id} className="board-item">
                <div className="board-item-main">
                  <h3>{p.title}</h3>
                  {p.content && <p className="board-content">{p.content}</p>}
                  {p.files.length > 0 && (
                    <div className="board-files">
                      {p.files.map((f) => (
                        <button key={f.id} onClick={() => download(f)} className="board-file" title="내려받기">
                          ↓ {f.fileName} <span>{formatBytes(f.sizeBytes)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="board-item-meta">
                  <span>{p.author || '-'}</span>
                  <span>{formatDate(p.createdAt)}</span>
                  <button onClick={() => remove(p)} className="board-delete">삭제</button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {open && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>자료 등록</h2>
              <button onClick={() => setOpen(false)} aria-label="닫기">✕</button>
            </div>
            <form className="app-form" onSubmit={submit}>
              <label>
                제목
                <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="자료 제목" />
              </label>
              <label>
                설명
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3}
                  placeholder="어떤 자료인지 간단히 적어주세요" />
              </label>
              <label>
                첨부 파일
                <input type="file" multiple onChange={(e) => pickFiles(e.target.files)} />
              </label>
              <p className="form-hint">
                파일당 최대 {formatBytes(MAX_FILE_BYTES)} · 게시글당 {MAX_FILES_PER_POST}개까지 ·
                실행파일(exe·bat 등)은 등록할 수 없습니다
              </p>
              {files.length > 0 && (
                <ul className="picked-files">
                  {files.map((f) => <li key={f.name}>{f.name} <span>{formatBytes(f.size)}</span></li>)}
                </ul>
              )}
              <div className="form-actions">
                <button type="button" onClick={() => setOpen(false)}>취소</button>
                <button type="submit" className="primary-action" disabled={saving}>
                  {saving ? '등록 중…' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
