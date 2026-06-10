import { useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { applyProjectFilters, defaultFilterState } from '../../utils/filters';
import type { ProjectFilterState } from '../../utils/filters';
import { ProjectTable } from './ProjectTable';
import { Card } from '../common/Card';
import { Search } from 'lucide-react';
import type { ProjectStatus } from '../../types';

const STATUSES: ProjectStatus[] = ['제안중', '제안완료', '확정/준비', '운영중', '보고/정산', '완료', '취소/보류'];

export function ProjectListPage() {
  const { projects, clients, loading } = useAppData();
  const [f, setF] = useState<ProjectFilterState>(defaultFilterState);

  const managers = useMemo(() => [...new Set(projects.map((p) => p.managerName))], [projects]);
  const filtered = useMemo(() => applyProjectFilters(projects, f), [projects, f]);
  const set = (patch: Partial<ProjectFilterState>) => setF((prev) => ({ ...prev, ...patch }));

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
          <span className="text-sm font-semibold text-slate-700">전체 {filtered.length}건</span>
        </div>
        <ProjectTable projects={filtered} />
      </Card>
    </div>
  );
}
