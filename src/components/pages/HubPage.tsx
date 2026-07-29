import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../common/toast';
import { useDialog } from '../common/dialog';
import {
  listApps, createApp, updateApp, deleteApp, bumpClick,
  listComments, addComment, type HubApp, type HubComment, type HubAppInput,
} from '../../services/hubService';
import '../../styles/hub.css';

// 업무자동화(앱 허브) — samsotta-hub의 기능·디자인을 그룹웨어에 이식 (2026-07-28)
// 원본은 Next.js 서버컴포넌트 + Cloudflare D1이라 그대로 옮길 수 없어 화면/기능을 재구현했다.
// 데이터는 신규 테이블(hub_apps/hub_comments)만 사용하며 기존 그룹웨어 데이터에 영향을 주지 않는다.
// 스타일은 styles/hub.css에서 .hub-scope 하위로 격리된다.

type FormValues = HubAppInput;

const categories = ['전체', '업무자동화', '교육', '생산성', 'AI 도구', '기타'];
const initialForm: FormValues = {
  name: '', description: '', category: '업무자동화', tags: '', url: '', registrant: '',
};
const categorySymbols: Record<string, string> = {
  업무자동화: '⚡', 교육: '◆', 생산성: '▦', 'AI 도구': '✦', 기타: '＋',
};

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function HubPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const me = profile?.name ?? profile?.email ?? '';

  const [apps, setApps] = useState<HubApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('popular');
  const [selected, setSelected] = useState<HubApp | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<HubComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');

  const loadApps = useCallback(async () => {
    setLoading(true);
    try { setApps(await listApps()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '앱 목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadApps(); }, [loadApps]);
  // 로그인 사용자를 등록자·작성자 기본값으로 (원본의 자유 입력을 대체)
  useEffect(() => { setCommentAuthor(me); }, [me]);

  // ESC로 팝업 닫기 — 그룹웨어 전체 규칙과 동일
  useEffect(() => {
    if (!selected && !formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (formOpen) setFormOpen(false); else setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, formOpen]);

  const visibleApps = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return apps
      .filter((app) => category === '전체' || app.category === category)
      .filter((app) => !keyword
        || `${app.name} ${app.description} ${app.tags} ${app.registrant}`.toLowerCase().includes(keyword))
      .sort((a, b) => {
        if (sort === 'new') return b.id - a.id;
        if (sort === 'name') return a.name.localeCompare(b.name, 'ko');
        return b.clickCount - a.clickCount || b.id - a.id;
      });
  }, [apps, category, query, sort]);

  async function openDetails(app: HubApp) {
    setSelected(app);
    setComments([]);
    try { setComments(await listComments(app.id)); } catch { /* 목록만 비워둔다 */ }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...initialForm, registrant: me });
    setFormOpen(true);
  }

  function openEdit(app: HubApp) {
    setEditingId(app.id);
    setForm({
      name: app.name, description: app.description, category: app.category,
      tags: app.tags, url: app.url, registrant: app.registrant,
    });
    setFormOpen(true);
    setSelected(null);
  }

  async function submitApp(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) await updateApp(editingId, form);
      else await createApp(form, profile?.id);
      setFormOpen(false);
      await loadApps();
      toast.success(editingId ? '앱 정보를 수정했습니다' : '앱을 등록했습니다');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다');
    } finally { setSaving(false); }
  }

  async function removeApp(app: HubApp) {
    if (!await dialog.confirm(`'${app.name}' 앱을 삭제할까요?\n등록된 개선 의견도 함께 삭제됩니다.`,
      { tone: 'danger', confirmText: '삭제' })) return;
    try {
      await deleteApp(app.id);
      setSelected(null);
      await loadApps();
      toast.success('삭제했습니다');
    } catch (e) { toast.error(e instanceof Error ? e.message : '삭제하지 못했습니다'); }
  }

  function launchApp(app: HubApp) {
    window.open(app.url, '_blank', 'noopener,noreferrer');
    setApps((cur) => cur.map((x) => (x.id === app.id ? { ...x, clickCount: x.clickCount + 1 } : x)));
    setSelected((cur) => (cur?.id === app.id ? { ...cur, clickCount: cur.clickCount + 1 } : cur));
    void bumpClick(app.id, app.clickCount);
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!selected || !commentText.trim()) return;
    try {
      await addComment(selected.id, commentText.trim(), commentAuthor.trim() || me, profile?.id);
      setCommentText('');
      setComments(await listComments(selected.id));
      setApps((cur) => cur.map((x) => (x.id === selected.id ? { ...x, commentCount: x.commentCount + 1 } : x)));
    } catch (e) { toast.error(e instanceof Error ? e.message : '의견을 등록하지 못했습니다'); }
  }

  return (
    <div className="hub-scope">
      <header className="site-header">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-main">APP GROUND</span>
          <span className="brand-sub">by SAM.SOTTA</span>
        </button>
        <nav aria-label="주요 메뉴">
          <a href="#apps">앱 둘러보기</a>
          {/* AI 뉴스 다이제스트(매일 08:00 발행) — 해당 사이트가 iframe 임베드를 차단(X-Frame-Options: DENY)하므로 새 창으로 연결한다 */}
          <a href="https://baeksang.dev/daily" target="_blank" rel="noopener noreferrer" className="nav-external"
            title="AI·개발 뉴스 다이제스트 — 새 창으로 열립니다">
            AI TODAY <span aria-hidden="true">↗</span>
          </a>
          <button onClick={openCreate} className="header-cta">
            앱 등록 <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span>✦</span> SAM.SOTTA INTERNAL APP HUB</p>
          <h1>필요한 앱을<br />바로 찾아 사용하세요</h1>
          <p className="hero-description">
            구성원이 만든 앱을 한곳에 모았습니다.<br />
            검색하고, 실행하고, 더 나은 아이디어를 남겨보세요.
          </p>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">앱 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="어떤 앱이 필요하세요?"
            />
            <button type="button" onClick={() => document.querySelector("#apps")?.scrollIntoView({ behavior: "smooth" })}>
              검색
            </button>
          </label>
          <div className="quick-categories" aria-label="빠른 카테고리">
            {categories.slice(1, 5).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setCategory(item);
                  document.querySelector("#apps")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span>{categorySymbols[item]}</span> {item}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-art" aria-label="앱과 아이디어를 표현한 그래픽">
          <div className="art-grid" />
          <div className="art-orange" />
          <div className="art-navy" />
          <div className="art-code">&lt;/&gt;</div>
          <div className="art-note">IDEA<br />TO<br />APP</div>
          <span className="art-spark">✦</span>
          <span className="art-plus">＋</span>
        </div>
      </section>

      <section className="stat-band">
        <p><strong>{apps.length}</strong>개의 사내 앱</p>
        <span>✦</span>
        <p><strong>{apps.reduce((sum, app) => sum + app.clickCount, 0).toLocaleString()}</strong>회 사용</p>
        <span>✦</span>
        <p><strong>{apps.reduce((sum, app) => sum + app.commentCount, 0)}</strong>개의 개선 의견</p>
        <button onClick={openCreate}>새 앱 등록하기 →</button>
      </section>

      <section className="catalog" id="apps">
        <div className="section-heading">
          <div>
            <p className="section-label">DISCOVER & USE</p>
            <h2><span>✳</span> 앱 둘러보기</h2>
          </div>
          <p>필요한 도구를 찾고 바로 실행하세요.</p>
        </div>

        <div className="catalog-tools">
          <div className="filter-row" aria-label="카테고리 필터">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <span>정렬</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="popular">많이 사용한 순</option>
              <option value="new">최신 등록순</option>
              <option value="name">이름순</option>
            </select>
          </label>
        </div>

        {error && <div className="notice error">{error}</div>}
        {loading ? (
          <div className="loading-grid" aria-label="앱 목록을 불러오는 중">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="loading-card" />)}
          </div>
        ) : visibleApps.length ? (
          <div className="app-grid">
            {visibleApps.map((app) => (
              <article className="app-card" key={app.id}>
                <button className="card-main" onClick={() => void openDetails(app)}>
                  <div className={`app-thumbnail tone-${app.id % 3}`}>
                    <div className="thumb-window">
                      <i /><i /><i />
                    </div>
                    <span className="thumb-symbol">{categorySymbols[app.category] || "＋"}</span>
                    <div className="thumb-lines"><i /><i /><i /></div>
                  </div>
                  <div className="card-copy">
                    <span className="card-badge">{app.id >= Math.max(...apps.map((item) => item.id)) - 1 ? "신규" : app.category}</span>
                    <h3>{app.name}</h3>
                    <p>{app.description}</p>
                    <div className="tag-list">
                      {app.tags.split(",").filter(Boolean).slice(0, 3).map((tag) => (
                        <span key={tag}>#{tag.trim()}</span>
                      ))}
                    </div>
                    <div className="card-meta">
                      <span>{app.registrant}</span>
                      <span>↗ {app.clickCount} · ◇ {app.commentCount}</span>
                    </div>
                  </div>
                </button>
                <button className="launch-button" onClick={() => launchApp(app)}>
                  앱 사용하기 <span>↗</span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span>⌕</span>
            <h3>찾는 앱이 아직 없습니다.</h3>
            <p>검색어를 바꾸거나 필요한 앱을 직접 등록해보세요.</p>
            <button onClick={openCreate}>앱 등록하기</button>
          </div>
        )}
      </section>

      <section className="bottom-cta">
        <p>HAVE A USEFUL APP?</p>
        <h2>작은 아이디어도<br />동료의 시간을 아껴줍니다.</h2>
        <button onClick={openCreate}>새 앱 등록하기 ↗</button>
      </section>

      <footer>
        <div>
          <strong>APP GROUND</strong>
          <span>by SAM.SOTTA</span>
        </div>
        <p>샘소타 구성원이 만든 앱을 가장 빠르게 만나는 곳.</p>
        <p>© 2026 SAM.SOTTA</p>
      </footer>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="닫기">×</button>
            <div className={`detail-visual tone-${selected.id % 3}`}>
              <span>{categorySymbols[selected.category] || "＋"}</span>
              <div>&lt;/&gt;</div>
            </div>
            <p className="section-label">{selected.category} · BY {selected.registrant}</p>
            <h2 id="detail-title">{selected.name}</h2>
            <p className="detail-description">{selected.description}</p>
            <div className="tag-list large">
              {selected.tags.split(",").filter(Boolean).map((tag) => (
                <span key={tag}>#{tag.trim()}</span>
              ))}
            </div>
            <div className="detail-actions">
              <button className="primary-action" onClick={() => launchApp(selected)}>앱 사용하기 ↗</button>
              <button onClick={() => openEdit(selected)}>수정</button>
              <button className="danger-action" onClick={() => void removeApp(selected)}>삭제</button>
            </div>
            <div className="detail-stats">
              <p><strong>{selected.clickCount}</strong><span>회 사용</span></p>
              <p><strong>{comments.length}</strong><span>개의 개선 의견</span></p>
              <p><strong>{formatDate(selected.createdAt)}</strong><span>등록</span></p>
            </div>
            <div className="comments">
              <h3>개선 의견</h3>
              <p className="comments-guide">사용하면서 떠오른 작은 개선점을 남겨주세요.</p>
              <form onSubmit={submitComment}>
                <input
                  value={commentAuthor}
                  onChange={(event) => setCommentAuthor(event.target.value)}
                  placeholder="이름"
                  aria-label="작성자 이름"
                />
                <div>
                  <input
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="어떻게 더 좋아질 수 있을까요?"
                    aria-label="개선 의견"
                  />
                  <button disabled={!commentText.trim()}>등록</button>
                </div>
              </form>
              <div className="comment-list">
                {comments.length ? comments.map((comment) => (
                  <article key={comment.id}>
                    <p>{comment.content}</p>
                    <span>{comment.author} · {formatDate(comment.createdAt)}</span>
                  </article>
                )) : <p className="no-comments">첫 번째 개선 의견을 남겨보세요.</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFormOpen(false);
        }}>
          <section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <button className="modal-close" onClick={() => setFormOpen(false)} aria-label="닫기">×</button>
            <p className="section-label">SHIP YOUR APP</p>
            <h2 id="form-title">{editingId ? "앱 정보 수정" : "새 앱 등록"}</h2>
            <p className="form-intro">작동하는 주소와 한 줄 소개만 있으면 충분합니다.</p>
            <form onSubmit={submitApp}>
              <label>
                앱 이름 <em>필수</em>
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="예: 회의록 요약기" />
              </label>
              <label>
                한 줄 소개 <em>필수</em>
                <input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="어떤 일을 도와주는 앱인가요?" />
              </label>
              <div className="form-row">
                <label>
                  카테고리
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {categories.slice(1).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  태그
                  <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="AI, 보고서, 교육" />
                </label>
              </div>
              <label>
                실행 주소 <em>필수</em>
                <input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://" />
              </label>
              <label>
                등록자
                <input value={form.registrant} onChange={(event) => setForm({ ...form, registrant: event.target.value })} placeholder="이름 또는 팀명" />
              </label>
              <div className="form-actions">
                <button type="button" onClick={() => setFormOpen(false)}>취소</button>
                <button className="primary-action" disabled={saving}>{saving ? "저장 중…" : editingId ? "수정 완료" : "앱 등록하기 ↗"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
