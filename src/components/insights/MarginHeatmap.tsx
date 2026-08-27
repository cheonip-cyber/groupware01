import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { activeProjects, projectYear } from '../../utils/filters';
import type { Project } from '../../types';
import { TrendingUp } from 'lucide-react';

// 마진율 히트맵 (고객사 × 연도) (2026-08-04 최초 작성, 2026-08-27 공용 컴포넌트로 분리)
// — 경영현황(관리자 전용)에만 있던 걸 리포트 메뉴에서도 쓸 수 있도록 독립 컴포넌트로 추출.
// — 매출 상위 8개 고객사 × 연도별 평균 이익률. 예산비용 미입력 건은 이익률이 자동 100%로
//   잡혀 왜곡되므로 계산에서 제외.

const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;
const marginBg = (r: number | null) => (r == null ? 'bg-slate-50 text-slate-400' : r >= 50 ? 'bg-amber-100 text-amber-700' : r >= 30 ? 'bg-emerald-100 text-emerald-700' : r >= 10 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600');

export function MarginHeatmap({ year }: { year: string }) {
  const { projects } = useAppData();

  const confirmed = useMemo(() => {
    const scoped = activeProjects(projects).filter((p) => year === '전체' || projectYear(p) === year);
    return scoped.filter((p) => CONFIRMED.has(p.projectStatus) && eff(p) > 0);
  }, [projects, year]);
  const hasBudget = (p: Project) => (p.expectedCost ?? 0) > 0;

  const clientRevenueRank = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of confirmed) {
      const key = p.clientName || '미지정';
      map.set(key, (map.get(key) ?? 0) + eff(p));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [confirmed]);

  const heatmap = useMemo(() => {
    const top = clientRevenueRank.slice(0, 8);
    const withBudget = confirmed.filter(hasBudget);
    const years = [...new Set(withBudget.map((p) => projectYear(p)).filter(Boolean))].sort() as string[];
    const cellFor = (client: string, yr: string) => {
      const rows = withBudget.filter((p) => (p.clientName || '미지정') === client && projectYear(p) === yr);
      if (!rows.length) return null;
      return rows.reduce((s, p) => s + p.profitRate, 0) / rows.length;
    };
    return { clients: top, years, cellFor };
  }, [confirmed, clientRevenueRank]);
  const budgetMissingCount = useMemo(() => confirmed.filter((p) => !hasBudget(p)).length, [confirmed]);

  if (heatmap.years.length === 0 || heatmap.clients.length === 0) return null;

  return (
    <Card>
      <CardHeader title="마진율 히트맵 (고객사 × 연도)" icon={<TrendingUp className="h-4 w-4 text-slate-400" />}
        action={
          <span className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-200" />50%+</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-200" />30%+</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-blue-100" />10%+</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-red-100" />10%↓</span>
          </span>
        } />
      {budgetMissingCount > 0 && (
        <p className="px-5 pt-2 text-[11px] text-slate-400">
          예산비용 미입력 {budgetMissingCount}건은 마진 계산에서 제외했습니다 (이익률이 자동 100%로 잡혀 왜곡되는 것을 방지)
        </p>
      )}
      <div className="overflow-x-auto p-5 pt-3">
        <table className="text-xs">
          <thead><tr>
            <th className="px-2 py-1 text-left font-medium text-slate-400">고객사</th>
            {heatmap.years.map((y) => <th key={y} className="px-2 py-1 text-center font-medium text-slate-400">{y}</th>)}
          </tr></thead>
          <tbody>
            {heatmap.clients.map((client) => (
              <tr key={client}>
                <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-700">{client}</td>
                {heatmap.years.map((y) => {
                  const v = heatmap.cellFor(client, y);
                  return (
                    <td key={y} className="px-1 py-1 text-center">
                      <span className={`inline-block min-w-[46px] rounded px-1.5 py-1 ${marginBg(v)}`}>{v == null ? '—' : `${v.toFixed(0)}%`}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
