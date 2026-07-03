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

export function Dashboard() {
  const { projects, paymentRequests, loading } = useAppData();
  const navigate = useNavigate();
  // 기간 필터: 매출월(없으면 교육일) 귀속 연도 기준. 기본값 올해 — 수년치 누적 합산으로 KPI가 왜곡되는 문제 방지
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));

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

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const goProjects = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ year, ...extra });
    navigate(`/projects?${q.toString()}`);
  };
  const yearLabel = year === '전체' ? '전체 연도' : year === '미지정' ? '연도 미지정' : `${year}년`;

  return (
    <div className="space-y-5">
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
        <KpiCard label="예상 매출" value={formatCompactKRW(kpi.expectedRevenue)} tone="blue" icon={<TrendingUp className="h-4 w-4" />}
          hint={`${yearLabel} 계약금액 합계 (취소/보류 제외)`} />
        <KpiCard label="예상 이익" value={formatCompactKRW(kpi.expectedProfit)} tone="emerald" icon={<TrendingUp className="h-4 w-4" />}
          hint="공급가액 - 비용(실지출 우선)" />
      </div>

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
