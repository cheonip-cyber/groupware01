import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { buildDashboardKpis } from '../../utils/calculations';
import { formatCompactKRW } from '../../utils/formatters';
import { KpiCard } from './KpiCard';
import { StatusChart } from './StatusChart';
import { TodoList } from './TodoList';
import { RiskProjectList } from './RiskProjectList';
import { ProjectSummaryTable } from './ProjectSummaryTable';
import { FolderKanban, CalendarClock, CheckCircle2, Play, FileBarChart, CreditCard, AlertCircle, TrendingUp } from 'lucide-react';

export function Dashboard() {
  const { projects, paymentRequests, loading } = useAppData();
  const kpi = useMemo(() => buildDashboardKpis(projects, paymentRequests), [projects, paymentRequests]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="전체 프로젝트" value={kpi.total} unit="건" icon={<FolderKanban className="h-4 w-4" />} hint={`이번 달 교육 ${kpi.thisMonth}건`} />
        <KpiCard label="확정/준비" value={kpi.confirmedReady} unit="건" tone="blue" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="운영 중" value={kpi.inProgress} unit="건" tone="amber" icon={<Play className="h-4 w-4" />} />
        <KpiCard label="보고/정산 대기" value={kpi.reportSettlement} unit="건" tone="emerald" icon={<FileBarChart className="h-4 w-4" />} />
        <KpiCard label="지급요청 대기" value={kpi.paymentPending} unit="건" tone="amber" icon={<CreditCard className="h-4 w-4" />} />
        <KpiCard label="이번 달 교육" value={kpi.thisMonth} unit="건" icon={<CalendarClock className="h-4 w-4" />} />
        <KpiCard label="세금계산서 미발행" value={kpi.taxInvoicePending} unit="건" tone="red" icon={<AlertCircle className="h-4 w-4" />} />
        <KpiCard label="미수금" value={kpi.unpaidCollection} unit="건" tone="red" icon={<AlertCircle className="h-4 w-4" />} />
        <KpiCard label="예상 매출" value={formatCompactKRW(kpi.expectedRevenue)} tone="blue" icon={<TrendingUp className="h-4 w-4" />} hint="진행+예정 계약 합계" />
        <KpiCard label="예상 이익" value={formatCompactKRW(kpi.expectedProfit)} tone="emerald" icon={<TrendingUp className="h-4 w-4" />} hint="계약 - 예상비용" />
      </div>

      {/* 차트 + 위험 + 할일 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StatusChart projects={projects} />
        <RiskProjectList projects={projects} />
        <TodoList projects={projects} />
      </div>

      {/* 요약 테이블 */}
      <ProjectSummaryTable projects={projects} />
    </div>
  );
}
