import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { applyProjectFilters, defaultFilterState, projectYear } from '../../utils/filters';
import type { ProjectFilterState } from '../../utils/filters';
import { ProjectTable } from './ProjectTable';
import { Card } from '../common/Card';
import { Search } from 'lucide-react';
import type { ProjectStatus } from '../../types';

// '제안완료'는 DB 상태 파생 로직상 나올 수 없는 값이라 필터 옵션에서 제외 (죽은 옵션 정리)
const STATUSES: ProjectStatus[] = ['제안중', '확정/준비', '운영중', '보고/정산', '완료', '취소/보류'];
const PAGE_SIZE = 50;

export function ProjectListPage() {
  const { projects, clients, loading } = useAppData();
  const [params] = useSearchParams();
  // 대시보드 KPI 드릴다운 등 URL 파라미터로 초기 필터 지정 가능 (?status=&year=&month=)
  const [f, setF] = useState<ProjectFilterState>(() => ({
    ...defaultFilterState,
    status: params.get('status') ?? defaultFilterState.status,
    year: params.get('year') ?? defaultFilterState.year,
    month: params.get('month') ?? defaultFilterState.month,
  }));
  const [page, setPage] = useState(1);

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

  const set = (patch: Partial<ProjectFilterState>) => setF((prev) => ({ ...prev, ...patch }));

  // 필터 변경 시 1페이지로 이동
  useEffect(() => { setPage(1); }, [f]);

  const totalPages = Math.max(1, Math.ceil(topLevel.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => topLevel.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [topLevel, safePage],
  );

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const selCls = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
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
          <select value={f.status} onChange={(e) => set({ status: e.target.value })} className={selCls}>
            <option value="">상태 전체</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
        <ProjectTable projects={pageRows} childrenIndex={childrenIndex} />
      </Card>
    </div>
  );
}
