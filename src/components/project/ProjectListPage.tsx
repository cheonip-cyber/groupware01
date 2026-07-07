import { useEffect, useMemo, useState } from 'react';
import { useEscClose } from '../../hooks/useEscClose';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { applyProjectFilters, defaultFilterState, projectYear } from '../../utils/filters';
import type { ProjectFilterState } from '../../utils/filters';
import { ProjectTable } from './ProjectTable';
import { Card } from '../common/Card';
import { Search } from 'lucide-react';
import { PageSkeleton } from '../common/Skeleton';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../common/toast';
import { Plus, X } from 'lucide-react';
import type { ProjectStatus } from '../../types';
import type { Project } from '../../types';
import { formatCompactKRW } from '../../utils/formatters';
import { MoneyText } from '../common/MoneyText';

// '제안완료'는 DB 상태 파생 로직상 나올 수 없는 값이라 필터 옵션에서 제외 (죽은 옵션 정리)
const STATUSES: ProjectStatus[] = ['제안중', '확정/준비', '운영중', '보고/정산', '완료', '취소/보류'];
const PAGE_SIZE = 50;

export function ProjectListPage() {
  const { projects, clients, loading, globalYear, createProject } = useAppData();
  const [params] = useSearchParams();
  // 초기 필터: URL 파라미터(드릴다운) > 전역 연도 컨텍스트 > 기본값
  const [f, setF] = useState<ProjectFilterState>(() => ({
    ...defaultFilterState,
    search: params.get('search') ?? defaultFilterState.search,
    statuses: params.get('status') ? [params.get('status')!] : defaultFilterState.statuses,
    year: params.get('year') ?? globalYear ?? defaultFilterState.year,
    month: params.get('month') ?? defaultFilterState.month,
  }));
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupPanel, setGroupPanel] = useState<Project | null>(null);
  useEscClose(!!groupPanel, () => setGroupPanel(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)
  const [cForm, setCForm] = useState({ projectName: '', clientName: '', finalEstimate: '', revenueMonth: '', startDate: '' });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const submitCreate = async () => {
    if (!cForm.projectName.trim() || !cForm.clientName.trim()) { toast.error('프로젝트명과 고객사는 필수입니다'); return; }
    setCreating(true);
    try {
      const id = await createProject({
        projectName: cForm.projectName, clientName: cForm.clientName,
        finalEstimate: Number(cForm.finalEstimate || 0),
        revenueMonth: cForm.revenueMonth || undefined, startDate: cForm.startDate || undefined,
      });
      toast.success('프로젝트가 생성되었습니다');
      setCreateOpen(false);
      navigate(`/projects/${id}`);
    } catch (e: any) { toast.error(`생성 실패: ${e?.message ?? e}`); }
    finally { setCreating(false); }
  };

  const managers = useMemo(() => [...new Set(projects.map((p) => p.managerName))], [projects]);
  const years = useMemo(() => {
    const ys = [...new Set(projects.map(projectYear).filter((y): y is string => !!y))].sort().reverse();
    const hasUnknown = projects.some((p) => !projectYear(p));
    return { ys, hasUnknown };
  }, [projects]);
  const filtered = useMemo(() => applyProjectFilters(projects, f), [projects, f]);

  // 그룹 묶어 보기: 자식(parentId 보유)은 마스터 아래에 표시. 필터에 자식만 걸려도 마스터를 최상위로 노출.
  const childrenIndex = useMemo(() => {
    const map = new Map<string, typeof projects>();
    for (const p of projects) {
      if (p.parentId) {
        if (!map.has(p.parentId)) map.set(p.parentId, [] as typeof projects);
        map.get(p.parentId)!.push(p);
      }
    }
    return map;
  }, [projects]);

  const topLevel = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const out: typeof projects = [];
    for (const p of filtered) {
      const top = p.parentId ? byId.get(p.parentId) ?? p : p;
      if (!seen.has(top.id)) { seen.add(top.id); out.push(top); }
    }
    return out;
  }, [filtered, projects]);

  // 검색/필터가 자식에 매칭되면 마스터를 자동 펼침 + 해당 자식 하이라이트
  // ("(N회차)" 검색 시 접힌 마스터만 보여 '안 묶인 것처럼' 보이던 혼란 해소)
  const autoExpandIds = useMemo(
    () => new Set(filtered.filter((p) => p.parentId).map((p) => p.parentId!)),
    [filtered],
  );
  const hasActiveQuery = f.search.trim().length > 0;

  const set = (patch: Partial<ProjectFilterState>) => setF((prev) => ({ ...prev, ...patch }));

  // 필터 변경 시 1페이지로 이동
  useEffect(() => { setPage(1); }, [f]);

  const totalPages = Math.max(1, Math.ceil(topLevel.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => topLevel.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [topLevel, safePage],
  );

  if (loading) return <PageSkeleton rows={10} />;

  const selCls = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> 새 프로젝트
        </button>
        <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="프로젝트·고객사·담당자 검색"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </div>
          <select value={f.year} onChange={(e) => set({ year: e.target.value })} className={selCls}>
            <option value="전체">연도 전체</option>
            {years.ys.map((y) => <option key={y} value={y}>{y}년</option>)}
            {years.hasUnknown && <option value="미지정">연도 미지정</option>}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUSES.map((st) => {
              const on = f.statuses.includes(st);
              return (
                <button key={st} type="button"
                  onClick={() => set({ statuses: on ? f.statuses.filter((x) => x !== st) : [...f.statuses, st] })}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600'}`}
                  title={on ? '필터 해제' : '이 상태만 보기 (복수 선택 가능)'}>
                  {st}
                </button>
              );
            })}
            {f.statuses.length > 0 && (
              <button type="button" onClick={() => set({ statuses: [] })}
                className="text-xs text-slate-400 underline hover:text-slate-600">전체</button>
            )}
          </div>
          <select value={f.clientId} onChange={(e) => set({ clientId: e.target.value })} className={selCls}>
            <option value="">고객사 전체</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.manager} onChange={(e) => set({ manager: e.target.value })} className={selCls}>
            <option value="">담당자 전체</option>{managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="month" value={f.month} onChange={(e) => set({ month: e.target.value })} className={selCls} />
          <select value={f.priority} onChange={(e) => set({ priority: e.target.value })} className={selCls}>
            <option value="">우선순위 전체</option><option value="높음">높음</option><option value="중간">중간</option><option value="낮음">낮음</option>
          </select>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as ProjectFilterState['sort'] })} className={selCls}>
            <option value="startDate">교육일자순</option><option value="contractAmount">계약금액순</option><option value="updatedAt">최근수정순</option>
          </select>
          <button onClick={() => set({ sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' })} className={`${selCls} hover:bg-slate-50`}>
            {f.sortDir === 'asc' ? '오름차순' : '내림차순'}
          </button>
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">
            전체 {filtered.length}건 <span className="font-normal text-slate-400">(그룹 {topLevel.length}행)</span>
            <span className="ml-2 text-xs font-normal text-slate-400">
              조회 기준: {f.year === '전체' ? '전체 연도' : f.year === '미지정' ? '연도 미지정' : `${f.year}년`} · 매출월(없으면 교육일)
            </span>
          </span>
          {totalPages > 1 && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">이전</button>
              {safePage} / {totalPages}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">다음</button>
            </span>
          )}
        </div>
        <ProjectTable projects={pageRows} childrenIndex={childrenIndex}
          startNo={(page - 1) * PAGE_SIZE + 1}
          matchedMasterIds={hasActiveQuery ? autoExpandIds : undefined}
          onOpenGroup={(m) => setGroupPanel(m)} />
      </Card>

      {/* 그룹 구성 패널: 들여쓰기 트리 대신 우측 슬라이드로 회차/분배 구성 확인 */}
      {groupPanel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setGroupPanel(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{groupPanel.projectName}</h3>
              <button onClick={() => setGroupPanel(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">✕</button>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              {groupPanel.groupType === 'recurring' ? '다회차' : groupPanel.groupType === 'distribution' ? '매출분배' : '통합 관리'} ·
              구성 {(childrenIndex.get(groupPanel.id) ?? []).length}건 · 그룹 매출 <b className="text-slate-600">{formatCompactKRW(groupPanel.groupTotalAmount ?? groupPanel.contractAmount)}</b>
            </p>
            <ul className="divide-y divide-slate-50 rounded-xl border border-slate-100">
              {(childrenIndex.get(groupPanel.id) ?? []).map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="w-5 text-xs text-slate-300">{i + 1}</span>
                  <Link to={`/projects/${c.id}`} className="flex-1 truncate font-medium text-slate-700 hover:text-blue-600 hover:underline">
                    {c.projectName}
                  </Link>
                  <span className="text-xs text-slate-400">{c.startDate || c.revenueMonth || '-'}</span>
                  <MoneyText value={c.contractAmount} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">구성 추가/해제는 마스터 프로젝트 상세의 그룹 관리에서 할 수 있습니다.</p>
            <Link to={`/projects/${groupPanel.id}`}
              className="mt-2 block rounded-lg bg-slate-800 py-2 text-center text-sm font-semibold text-white hover:bg-slate-700">
              마스터 프로젝트 열기 →
            </Link>
          </div>
        </div>
      )}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">새 프로젝트</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2.5">
              <input value={cForm.projectName} onChange={(e) => setCForm((f) => ({ ...f, projectName: e.target.value }))}
                placeholder="프로젝트명 *" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <input value={cForm.clientName} onChange={(e) => setCForm((f) => ({ ...f, clientName: e.target.value }))}
                placeholder="고객사명 * (없으면 자동 등록)" list="client-options"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <datalist id="client-options">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              <input value={cForm.finalEstimate} onChange={(e) => setCForm((f) => ({ ...f, finalEstimate: e.target.value }))}
                type="number" placeholder="계약금액 (세전, 원)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">매출월
                  <input value={cForm.revenueMonth} onChange={(e) => setCForm((f) => ({ ...f, revenueMonth: e.target.value }))}
                    type="month" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none" />
                </label>
                <label className="text-xs text-slate-400">교육일
                  <input value={cForm.startDate} onChange={(e) => setCForm((f) => ({ ...f, startDate: e.target.value }))}
                    type="date" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none" />
                </label>
              </div>
              <p className="text-[11px] text-slate-400">상태는 '요청/담당'으로 시작하며, 상세 화면 상단에서 언제든 변경할 수 있습니다. 부가세는 별도 기준입니다.</p>
              <button onClick={submitCreate} disabled={creating}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? '생성 중…' : '프로젝트 생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
