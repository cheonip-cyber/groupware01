import { useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { countProjectsByStatus } from '../../utils/calculations';
import { projectStatusChartColor } from '../../utils/statusConfig';
import { formatCompactKRW } from '../../utils/formatters';
import { projectYear } from '../../utils/filters';
import { BarChart3, TrendingUp } from 'lucide-react';
import type { Project } from '../../types';

// 매출 규칙(구 그룹웨어 방식): 확정군=확정 매출, 제안중=예상 매출, 취소/보류=미반영, 유효매출(그룹 이중계상 제거) 기준
const CONFIRMED_SET = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;

export function ReportsPage() {
  const { projects, loading } = useAppData();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(projectYear).filter((y): y is string => !!y))].sort().reverse();
    return ys;
  }, [projects]);

  const filtered = useMemo(() => {
    const base = projects.filter((p) => p.projectStatus !== '취소/보류');
    if (year === '전체') return base;
    return base.filter((p) => projectYear(p) === year);
  }, [projects, year]);

  // 월별 확정/예상 매출 추이 (매출월 기준)
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; confirmed: number; expected: number }>();
    for (const p of filtered) {
      const mon = p.revenueMonth;
      if (!mon) continue;
      if (!map.has(mon)) map.set(mon, { month: mon, confirmed: 0, expected: 0 });
      const row = map.get(mon)!;
      if (CONFIRMED_SET.has(p.projectStatus)) row.confirmed += eff(p);
      else if (p.projectStatus === '제안중') row.expected += eff(p);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  // 고객사별 매출 (유효매출 + 매출분배 자식은 마스터 고객사로 귀속)
  const clientRevenue = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const map: Record<string, number> = {};
    filtered.forEach((p) => {
      const amount = eff(p);
      if (amount <= 0) return;
      const attributed = p.groupType === 'distribution' && p.parentId
        ? byId.get(p.parentId)?.clientName ?? p.clientName
        : p.clientName;
      const key = attributed || '(미지정)';
      map[key] = (map[key] ?? 0) + amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [filtered, projects]);

  const statusData = useMemo(() => {
    const counts = countProjectsByStatus(filtered);
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const totals = useMemo(() => ({
    confirmed: filtered.filter((p) => CONFIRMED_SET.has(p.projectStatus)).reduce((s, p) => s + eff(p), 0),
    expected: filtered.filter((p) => p.projectStatus === '제안중').reduce((s, p) => s + eff(p), 0),
    profit: filtered.reduce((s, p) => s + (eff(p) - (p.expectedCost || 0)), 0),
  }), [filtered]);
  const totalRev = totals.confirmed + totals.expected;

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-400">
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          <option value="전체">전체 연도</option>
        </select>
        <span className="text-xs text-slate-400">
          조회 기준: 매출월 귀속 · 확정(확정/준비·운영·정산·종료) / 예상(제안) / 취소·보류 미반영 · 그룹 이중계상 제거
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="확정 매출" value={formatCompactKRW(totals.confirmed)} tone="text-blue-600" />
        <SummaryCard label="예상 매출 (제안)" value={formatCompactKRW(totals.expected)} tone="text-amber-600" />
        <SummaryCard label="이익 (매출-예산비용)" value={formatCompactKRW(totals.profit)} tone="text-emerald-600" />
        <SummaryCard label="이익률" value={`${totalRev > 0 ? ((totals.profit / totalRev) * 100).toFixed(1) : 0}%`} tone="text-slate-800" />
      </div>

      <Card>
        <CardHeader title="월별 매출 현황 (확정 / 예상)" icon={<TrendingUp className="h-4 w-4 text-slate-400" />} />
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: number, name: string) => [formatCompactKRW(v) + '원', name === 'confirmed' ? '확정 매출' : '예상 매출']} />
              <Legend formatter={(v) => (v === 'confirmed' ? '확정 매출' : '예상 매출')} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="confirmed" stackId="rev" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="expected" stackId="rev" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="고객사별 매출 랭킹 (매출분배는 메인 고객사 귀속)" icon={<BarChart3 className="h-4 w-4 text-slate-400" />} />
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientRevenue} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => [formatCompactKRW(v) + '원', '유효매출']} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="프로젝트 상태 분포" icon={<BarChart3 className="h-4 w-4 text-slate-400" />} />
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={90} paddingAngle={2}>
                  {statusData.map((d) => (
                    <Cell key={d.name} fill={projectStatusChartColor[d.name as keyof typeof projectStatusChartColor]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}건`, '']} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
