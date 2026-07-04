import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { buildDashboardKpis } from '../../utils/calculations';
import { projectYear } from '../../utils/filters';
import { formatCompactKRW } from '../../utils/formatters';
import { KpiCard } from './KpiCard';
import { StatusChart } from './StatusChart';
import { TodoList } from './TodoList';
import { RiskProjectList } from './RiskProjectList';
import { ProjectSummaryTable } from './ProjectSummaryTable';
import { FolderKanban, CalendarClock, CheckCircle2, Play, FileBarChart, CreditCard, AlertCircle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PageSkeleton } from '../common/Skeleton';
import type { Project } from '../../types';

export function Dashboard() {
  const { projects, paymentRequests, loading, globalYear, setGlobalYear } = useAppData();
  const navigate = useNavigate();
  // 기간 필터: 전역 연도 컨텍스트 공유 (헤더·리포트·목록과 동일 기간 유지)
  const year = globalYear;
  const setYear = setGlobalYear;

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(projectYear).filter((y): y is string => !!y))].sort().reverse();
    const hasUnknown = projects.some((p) => !projectYear(p));
    return { ys, hasUnknown };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (year === '전체') return projects;
    if (year === '미지정') return projects.filter((p) => !projectYear(p));
    return projects.filter((p) => projectYear(p) === year);
  }, [projects, year]);

  const filteredPayments = useMemo(() => {
    if (year === '전체') return paymentRequests;
    const ids = new Set(filteredProjects.map((p) => p.id));
    return paymentRequests.filter((r) => ids.has(r.projectId));
  }, [paymentRequests, filteredProjects, year]);

  const kpi = useMemo(() => buildDashboardKpis(filteredProjects, filteredPayments), [filteredProjects, filteredPayments]);

  if (loading) return <PageSkeleton />;

  const goProjects = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ year, ...extra });
    navigate(`/projects?${q.toString()}`);
  };
  const yearLabel = year === '전체' ? '전체 연도' : year === '미지정' ? '연도 미지정' : `${year}년`;

  // 오늘 할 일 액션밴드: 연체 지급 / 미수금 / 이번 주 교육
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const overduePay = paymentRequests.filter((r) => r.status !== '지급완료' && r.dueDate && r.dueDate < todayStr).length;
  const weekEdu = filteredProjects.filter((p) => p.startDate && p.startDate >= todayStr && p.startDate <= weekEnd && p.projectStatus !== '취소/보류').length;
  const actions = [
    overduePay > 0 && { label: `연체 지급 ${overduePay}건`, to: '/payments', tone: 'red' },
    kpi.unpaidCollection > 0 && { label: `미수금 ${kpi.unpaidCollection}건`, to: '/revenue', tone: 'amber' },
    weekEdu > 0 && { label: `이번 주 교육 ${weekEdu}건`, to: `/projects?year=${year}`, tone: 'blue' },
  ].filter(Boolean) as { label: string; to: string; tone: string }[];

  return (
    <div className="space-y-5">
      {/* 오늘 할 일 액션밴드 */}
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="text-xs font-bold text-slate-500">지금 확인할 항목</span>
          {actions.map((a) => (
            <button key={a.label} onClick={() => navigate(a.to)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
                a.tone === 'red' ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : a.tone === 'amber' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
              {a.label} →
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-xs font-medium text-emerald-600">
          ✓ 처리할 긴급 항목이 없습니다 (연체 지급 · 미수금 기준)
        </div>
      )}

      {/* 조회 기준 */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-400">
          {years.ys.map((y) => <option key={y} value={y}>{y}년</option>)}
          <option value="전체">전체 연도</option>
          {years.hasUnknown && <option value="미지정">연도 미지정</option>}
        </select>
        <span className="text-xs text-slate-400">조회 기준: {yearLabel} · 매출월(없으면 교육일) 귀속 · 카드 클릭 시 목록으로 이동</span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="전체 프로젝트" value={kpi.total} unit="건" icon={<FolderKanban className="h-4 w-4" />}
          onClick={() => goProjects()} />
        <KpiCard label="확정/준비" value={kpi.confirmedReady} unit="건" tone="blue" icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => goProjects({ status: '확정/준비' })} />
        <KpiCard label="운영 중" value={kpi.inProgress} unit="건" tone="amber" icon={<Play className="h-4 w-4" />}
          onClick={() => goProjects({ status: '운영중' })} />
        <KpiCard label="보고/정산 대기" value={kpi.reportSettlement} unit="건" tone="emerald" icon={<FileBarChart className="h-4 w-4" />}
          onClick={() => goProjects({ status: '보고/정산' })} />
        <KpiCard label="지급요청 대기" value={kpi.paymentPending} unit="건" tone="amber" icon={<CreditCard className="h-4 w-4" />}
          onClick={() => navigate('/payments')} />
        <KpiCard label="이번 달 교육" value={kpi.thisMonth} unit="건" icon={<CalendarClock className="h-4 w-4" />}
          onClick={() => goProjects({ month: new Date().toISOString().slice(0, 7) })} />
        <KpiCard label="세금계산서 미발행" value={kpi.taxInvoicePending} unit="건" tone="red" icon={<AlertCircle className="h-4 w-4" />}
          hint="견적 단계 제외" onClick={() => navigate('/revenue')} />
        <KpiCard label="미수금" value={kpi.unpaidCollection} unit="건" tone="red" icon={<AlertCircle className="h-4 w-4" />}
          hint="계산서 발행 후 미입금" onClick={() => navigate('/revenue')} />
        <KpiCard label="확정 매출" value={formatCompactKRW(kpi.confirmedRevenue)} tone="blue" icon={<TrendingUp className="h-4 w-4" />}
          hint="확정/준비·운영·정산·종료 프로젝트" />
        <KpiCard label="예상 매출" value={formatCompactKRW(kpi.expectedRevenue)} tone="amber" icon={<TrendingUp className="h-4 w-4" />}
          hint="제안 단계 (취소/보류 미반영)" />
        <KpiCard label="이익" value={formatCompactKRW(kpi.expectedProfit)} tone="emerald" icon={<TrendingUp className="h-4 w-4" />}
          hint={`매출 - 예산비용 · 이익률 ${kpi.profitRate}%`} />
      </div>

      {/* 월별 매출 미니차트 (리포트 상세는 /reports) */}
      <MiniRevenueChart projects={filteredProjects} onMore={() => navigate('/reports')} />

      {/* 차트 + 위험 + 할일 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StatusChart projects={filteredProjects} />
        <RiskProjectList projects={filteredProjects} />
        <TodoList projects={filteredProjects} />
      </div>

      {/* 요약 테이블 */}
      <ProjectSummaryTable projects={filteredProjects} />
    </div>
  );
}

// 월별 확정/예상 매출 미니차트 — 유효매출 기준 (그룹 이중계상 제거)
function MiniRevenueChart({ projects, onMore }: { projects: Project[]; onMore: () => void }) {
  const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
  const map = new Map<string, { month: string; confirmed: number; expected: number }>();
  for (const p of projects) {
    if (!p.revenueMonth || p.projectStatus === '취소/보류') continue;
    if (!map.has(p.revenueMonth)) map.set(p.revenueMonth, { month: p.revenueMonth.slice(5), confirmed: 0, expected: 0 });
    const row = map.get(p.revenueMonth)!;
    const amt = p.effectiveAmount ?? p.contractAmount ?? 0;
    if (CONFIRMED.has(p.projectStatus)) row.confirmed += amt;
    else if (p.projectStatus === '제안중') row.expected += amt;
  }
  const data = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  if (data.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">월별 매출 (확정/예상)</h4>
        <button onClick={onMore} className="text-xs text-blue-600 hover:underline">리포트 상세 →</button>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 10 }} width={56} />
            <Tooltip formatter={(v: number, n: string) => [v.toLocaleString('ko-KR') + '원', n === 'confirmed' ? '확정' : '예상']} />
            <Bar dataKey="confirmed" stackId="r" fill="#3b82f6" />
            <Bar dataKey="expected" stackId="r" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
