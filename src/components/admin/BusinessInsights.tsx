import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { activeProjects, projectYear } from '../../utils/filters';
import type { Project } from '../../types';
import { Building2, Users, BookOpen, Flame, Minus, Snowflake, AlertTriangle, Award, TrendingUp } from 'lucide-react';
import { InstructorEngagementStatus } from './InstructorEngagementStatus';

// 경영현황 신규 인사이트 (2026-08-04)
// — 과거 레거시 그룹웨어의 '영업 인텔리전스' 메뉴(Health Score/다양성 지수/프로그램 트렌드/마진 히트맵)를
//   groupware01의 데이터 모델(projects/paymentRequests, useAppData)에 맞춰 이식.
// — 새 DB 조회 없이 이미 로드된 컨텍스트 데이터만으로 계산한다(성능/복잡도 최소화).
// — 알림/메모 기능은 요청에 따라 제외.

const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;

const healthColor = (s: number) => (s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-blue-600' : s >= 40 ? 'text-amber-600' : 'text-red-600');
const healthBg = (s: number) => (s >= 80 ? 'bg-emerald-50 border-emerald-200' : s >= 60 ? 'bg-blue-50 border-blue-200' : s >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200');
const marginColor = (r: number | null) => (r == null ? 'text-slate-400' : r >= 50 ? 'text-amber-500' : r >= 30 ? 'text-emerald-500' : r >= 10 ? 'text-blue-500' : 'text-red-500');
const marginBg = (r: number | null) => (r == null ? 'bg-slate-50 text-slate-400' : r >= 50 ? 'bg-amber-100 text-amber-700' : r >= 30 ? 'bg-emerald-100 text-emerald-700' : r >= 10 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600');

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

  // ── 마진율 히트맵 (매출 상위 8개 고객사 × 연도) ──
  const heatmap = useMemo(() => {
    const top = clientStats.slice(0, 8).map((c) => c.name);
    const withBudget = confirmed.filter(hasBudget);
    const years = [...new Set(withBudget.map((p) => projectYear(p)).filter(Boolean))].sort() as string[];
    const cellFor = (client: string, yr: string) => {
      const rows = withBudget.filter((p) => (p.clientName || '미지정') === client && projectYear(p) === yr);
      if (!rows.length) return null;
      return rows.reduce((s, p) => s + p.profitRate, 0) / rows.length;
    };
    return { clients: top, years, cellFor };
  }, [confirmed, clientStats]);
  const budgetMissingCount = useMemo(() => confirmed.filter((p) => !hasBudget(p)).length, [confirmed]);

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

  // ── 프로그램(주제) 수요 트렌드 ──
  const programTrend = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const p of confirmed) {
      const topic = p.topic || '미분류';
      const y = projectYear(p);
      if (!y) continue;
      if (!map.has(topic)) map.set(topic, {});
      const byYear = map.get(topic)!;
      byYear[y] = (byYear[y] || 0) + 1;
    }
    return [...map.entries()]
      .map(([topic, byYear]) => {
        const years = Object.keys(byYear).sort();
        const total = Object.values(byYear).reduce((s, n) => s + n, 0);
        let trend: 'rising' | 'stable' | 'declining' | 'na' = 'na';
        if (years.length >= 2) {
          const latest = byYear[years[years.length - 1]];
          const prev = byYear[years[years.length - 2]];
          trend = latest > prev * 1.1 ? 'rising' : latest < prev * 0.9 ? 'declining' : 'stable';
        }
        return { topic, total, trend };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [confirmed]);

  // ── 리스크 조기경보 ──
  const riskProjects = useMemo(
    () => scoped.filter((p) => p.riskFlags && p.riskFlags.length > 0).sort((a, b) => eff(b) - eff(a)).slice(0, 6),
    [scoped],
  );
  const taxPending = useMemo(
    () => scoped.filter((p) => CONFIRMED.has(p.projectStatus) && !p.taxInvoiceIssued)
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')).slice(0, 6),
    [scoped],
  );
  const upcomingNoTrainer = useMemo(() => {
    const now = new Date();
    return scoped
      .filter((p) => (!p.trainerIds || p.trainerIds.length === 0) && p.projectStatus !== '제안중' && !!p.startDate)
      .filter((p) => { const diff = (new Date(p.startDate).getTime() - now.getTime()) / 86400000; return diff >= 0 && diff <= 14; })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 6);
  }, [scoped]);

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

      {heatmap.years.length > 0 && heatmap.clients.length > 0 && (
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
      )}

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

        <Card>
          <CardHeader title="프로그램(주제) 수요 트렌드" icon={<BookOpen className="h-4 w-4 text-slate-400" />}
            action={<span className="text-[11px] text-slate-400">전년 대비 ±10% 기준</span>} />
          <ul className="divide-y divide-slate-50 px-5 pb-3">
            {programTrend.map((p) => (
              <li key={p.topic} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 truncate font-medium text-slate-700">{p.topic}</span>
                <TrendBadge trend={p.trend} />
                <span className="w-10 text-right text-xs text-slate-400">{p.total}건</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="리스크 조기경보" icon={<AlertTriangle className="h-4 w-4 text-slate-400" />} />
        <div className="grid grid-cols-1 gap-5 p-5 pt-3 lg:grid-cols-3">
          <RiskList title="위험 플래그 (금액순)" items={riskProjects.map((p) => ({ label: p.projectName, sub: p.riskFlags.join(', '), amount: eff(p) }))} empty="해당 없음" />
          <RiskList title="세금계산서 미발행" items={taxPending.map((p) => ({ label: p.projectName, sub: p.clientName, amount: eff(p) }))} empty="전 건 발행 완료" />
          <RiskList title="강사 미확정 (D-14 이내)" items={upcomingNoTrainer.map((p) => ({ label: p.projectName, sub: p.startDate, amount: eff(p) }))} empty="해당 없음" />
        </div>
      </Card>

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

      <InstructorEngagementStatus />
    </div>
  );
}

function TrendBadge({ trend }: { trend: 'rising' | 'stable' | 'declining' | 'na' }) {
  if (trend === 'na') return <span className="text-[10px] text-slate-300">데이터부족</span>;
  const cfg = {
    rising: { icon: Flame, label: '상승', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
    stable: { icon: Minus, label: '유지', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    declining: { icon: Snowflake, label: '하락', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  }[trend];
  const Icon = cfg.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}><Icon className="h-2.5 w-2.5" />{cfg.label}</span>;
}

function RiskList({ title, items, empty }: { title: string; items: { label: string; sub: string; amount: number }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">{title}</p>
      {items.length === 0 ? <p className="text-xs text-slate-300">{empty}</p> : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
              <p className="truncate font-medium text-slate-700">{it.label}</p>
              <p className="flex items-center justify-between text-[10px] text-slate-400"><span className="truncate">{it.sub}</span><MoneyText value={it.amount} compact className="text-slate-500" /></p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
