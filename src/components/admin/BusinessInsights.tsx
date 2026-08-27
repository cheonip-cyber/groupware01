import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { activeProjects, projectYear } from '../../utils/filters';
import type { Project } from '../../types';
import { Building2, Users, AlertTriangle, Award } from 'lucide-react';
import { RiskEarlyWarning } from '../insights/RiskEarlyWarning';
import { ProgramDemandTrend } from '../insights/ProgramDemandTrend';
import { MarginHeatmap } from '../insights/MarginHeatmap';

// 경영현황 신규 인사이트 (2026-08-04)
// — 과거 레거시 그룹웨어의 '영업 인텔리전스' 메뉴(Health Score/다양성 지수/프로그램 트렌드/마진 히트맵)를
//   groupware01의 데이터 모델(projects/paymentRequests, useAppData)에 맞춰 이식.
// — 새 DB 조회 없이 이미 로드된 컨텍스트 데이터만으로 계산한다(성능/복잡도 최소화).
// — 알림/메모 기능은 요청에 따라 제외.
// — 2026-08-27: 리스크조기경보/프로그램수요트렌드/마진율히트맵 3개 섹션은 리포트 메뉴에서도
//   똑같이 필요해져서 공용 컴포넌트(src/components/insights/)로 분리, 여기서는 그걸 가져다 씀.

const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;

const healthColor = (s: number) => (s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-blue-600' : s >= 40 ? 'text-amber-600' : 'text-red-600');
const healthBg = (s: number) => (s >= 80 ? 'bg-emerald-50 border-emerald-200' : s >= 60 ? 'bg-blue-50 border-blue-200' : s >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200');
const marginColor = (r: number | null) => (r == null ? 'text-slate-400' : r >= 50 ? 'text-amber-500' : r >= 30 ? 'text-emerald-500' : r >= 10 ? 'text-blue-500' : 'text-red-500');

export function BusinessInsights({ year }: { year: string }) {
  const { projects, paymentRequests } = useAppData();

  // 연도 필터: 경영현황 KPI(회사 총매출 확정)와 동일 기준 — 선택 연도와 정확히 일치하는 건만.
  // (2026-08-04 수정: 이전에는 매출월/교육일자 미입력 건을 연도 무관하게 항상 포함시켜
  //  KPI와 담당자별 운영현황 등 이 화면 집계 사이에 차액이 발생했다.)
  const scoped = useMemo(
    () => activeProjects(projects).filter((p) => year === '전체' || projectYear(p) === year),
    [projects, year],
  );
  const confirmed = useMemo(() => scoped.filter((p) => CONFIRMED.has(p.projectStatus) && eff(p) > 0), [scoped]);
  // 예산비용이 입력되지 않은 프로젝트는 이익률이 자동으로 100%로 계산되어(0으로 나누는 것을 피하기 위한 기본값)
  // 실제 마진과 무관하게 값이 부풀려진다. 마진 관련 집계에서는 이런 건을 제외한다.
  const hasBudget = (p: Project) => (p.expectedCost ?? 0) > 0;

  // ── 고객사 매출 집중도 + Health Score ──
  const clientStats = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number; margins: number[]; lastDate: string }>();
    for (const p of confirmed) {
      const key = p.clientName || '미지정';
      if (!map.has(key)) map.set(key, { name: key, revenue: 0, count: 0, margins: [], lastDate: '' });
      const c = map.get(key)!;
      c.revenue += eff(p);
      c.count += 1;
      if (hasBudget(p)) c.margins.push(p.profitRate);
      const d = p.revenueMonth || p.startDate || '';
      if (d > c.lastDate) c.lastDate = d;
    }
    const now = new Date();
    return [...map.values()]
      .map((c) => {
        const avgMargin = c.margins.length ? c.margins.reduce((s, m) => s + m, 0) / c.margins.length : null;
        let monthsAgo = 99;
        if (c.lastDate) {
          const [y, m] = c.lastDate.slice(0, 7).split('-').map(Number);
          if (y && m) monthsAgo = Math.floor((now.getTime() - new Date(y, m - 1).getTime()) / (1000 * 60 * 60 * 24 * 30));
        }
        const marginScore = avgMargin != null ? Math.min((avgMargin / 50) * 40, 40) : 0;
        const freqScore = Math.min((c.count / 10) * 30, 30);
        const recencyScore = monthsAgo <= 6 ? 30 : monthsAgo <= 12 ? 20 : monthsAgo <= 24 ? 10 : 0;
        return { ...c, avgMargin, monthsAgo, healthScore: Math.round(marginScore + freqScore + recencyScore) };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [confirmed]);

  const totalRevenue = clientStats.reduce((s, c) => s + c.revenue, 0);
  const pareto = useMemo(() => {
    let cum = 0;
    return clientStats.map((c) => {
      cum += c.revenue;
      return { ...c, share: totalRevenue ? (c.revenue / totalRevenue) * 100 : 0, cumShare: totalRevenue ? (cum / totalRevenue) * 100 : 0 };
    });
  }, [clientStats, totalRevenue]);
  const paretoCount = pareto.findIndex((c) => c.cumShare >= 80) + 1;

  const atRisk = [...clientStats].filter((c) => c.healthScore < 40).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topHealthy = [...clientStats].sort((a, b) => b.healthScore - a.healthScore).slice(0, 5);

  // ── 강사·업체 다양성 지수 ──
  const partnerStats = useMemo(() => {
    const map = new Map<string, { name: string; type: string; total: number; count: number; clients: Set<string> }>();
    for (const r of paymentRequests) {
      if (!r.payeeName || r.payeeType === '기타') continue;
      const key = r.payeeName;
      if (!map.has(key)) map.set(key, { name: key, type: r.payeeType, total: 0, count: 0, clients: new Set() });
      const p = map.get(key)!;
      p.total += Number(r.amount) || 0;
      p.count += 1;
      if (r.clientName) p.clients.add(r.clientName);
    }
    return [...map.values()]
      .map((p) => ({ ...p, clientCount: p.clients.size, diversity: Math.round(Math.min((p.clients.size / 6) * 100, 100)) }))
      .sort((a, b) => b.total - a.total);
  }, [paymentRequests]);
  const dependencyRisk = partnerStats.filter((p) => p.diversity <= 20 && p.total > 0).slice(0, 6);

  // ── 담당자(PM)별 운영 현황 ──
  const pmStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; margins: number[] }>();
    for (const p of confirmed) {
      const key = p.managerName || '미지정';
      if (!map.has(key)) map.set(key, { name: key, count: 0, revenue: 0, margins: [] });
      const m = map.get(key)!;
      m.count += 1;
      m.revenue += eff(p);
      if (hasBudget(p)) m.margins.push(p.profitRate);
    }
    return [...map.values()]
      .map((m) => ({ ...m, avgMargin: m.margins.length ? m.margins.reduce((s, x) => s + x, 0) / m.margins.length : null }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [confirmed]);

  if (confirmed.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="pt-1 text-xs font-semibold text-slate-400">경영 인사이트</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="고객사 매출 집중도" icon={<Building2 className="h-4 w-4 text-slate-400" />}
            action={paretoCount > 0 ? <span className="text-[11px] text-slate-400">상위 {paretoCount}개사가 매출 80% 차지</span> : undefined} />
          <ul className="divide-y divide-slate-50 px-5 pb-3">
            {pareto.slice(0, 6).map((c, i) => (
              <li key={c.name} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-5 text-xs text-slate-300">{i + 1}</span>
                <span className="flex-1 truncate font-medium text-slate-700">{c.name}</span>
                <span className="text-xs text-slate-400">{c.share.toFixed(1)}%</span>
                <MoneyText value={c.revenue} compact />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="고객사 Health Score" icon={<Award className="h-4 w-4 text-slate-400" />}
            action={<span className="text-[11px] text-slate-400">마진+거래빈도+최근성 종합 100점</span>} />
          <ul className="divide-y divide-slate-50 px-5 pb-3">
            {topHealthy.map((c, i) => (
              <li key={c.name} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-5 text-xs text-slate-300">{i + 1}</span>
                <span className="flex-1 truncate font-medium text-slate-700">{c.name}</span>
                <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${healthBg(c.healthScore)} ${healthColor(c.healthScore)}`}>{c.healthScore}</span>
              </li>
            ))}
          </ul>
          {atRisk.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-red-500"><AlertTriangle className="h-3 w-3" />이탈 위험 고객사 (Score 40 미만)</p>
              <div className="flex flex-wrap gap-1.5">
                {atRisk.map((c) => <span key={c.name} className="rounded-full bg-red-50 px-2 py-1 text-[11px] text-red-600">{c.name} ({c.healthScore})</span>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      <MarginHeatmap year={year} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="강사·업체 다양성 지수" icon={<Users className="h-4 w-4 text-slate-400" />}
            action={<span className="text-[11px] text-slate-400">거래 고객사 수 기준</span>} />
          <ul className="divide-y divide-slate-50 px-5 pb-3">
            {partnerStats.slice(0, 6).map((p, i) => (
              <li key={p.name} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-5 text-xs text-slate-300">{i + 1}</span>
                <span className="flex-1 truncate font-medium text-slate-700">{p.name}<span className="ml-1 text-[10px] text-slate-400">{p.type}</span></span>
                <span className="text-xs text-slate-400">{p.clientCount}개사</span>
                <MoneyText value={p.total} compact />
              </li>
            ))}
          </ul>
          {dependencyRisk.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="h-3 w-3" />특정 고객사 의존도 높음 (다양성 20 이하)</p>
              <div className="flex flex-wrap gap-1.5">
                {dependencyRisk.map((p) => <span key={p.name} className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700">{p.name}</span>)}
              </div>
            </div>
          )}
        </Card>

        <ProgramDemandTrend year={year} />
      </div>

      <RiskEarlyWarning year={year} />

      <Card>
        <CardHeader title="담당자별 운영 현황" icon={<Users className="h-4 w-4 text-slate-400" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-5 py-2.5 font-medium">담당자</th>
              <th className="px-3 py-2.5 text-right font-medium">진행 건수</th>
              <th className="px-3 py-2.5 text-right font-medium">매출 합계</th>
              <th className="px-3 py-2.5 text-right font-medium">평균 마진율</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {pmStats.map((m) => (
                <tr key={m.name}>
                  <td className="px-5 py-2.5 font-medium text-slate-700">{m.name}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{m.count}건</td>
                  <td className="px-3 py-2.5 text-right"><MoneyText value={m.revenue} compact /></td>
                  <td className={`px-3 py-2.5 text-right font-medium ${marginColor(m.avgMargin)}`}>{m.avgMargin != null ? `${m.avgMargin.toFixed(1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
