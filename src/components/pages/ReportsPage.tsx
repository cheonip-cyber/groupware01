import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompactKRW } from '../../utils/formatters';
import { projectYear, activeProjects } from '../../utils/filters';
import { BarChart3 } from 'lucide-react';
import { PageSkeleton } from '../common/Skeleton';
import { ClientPaymentLagSection } from './ClientPaymentLagSection';
import { RiskEarlyWarning } from '../insights/RiskEarlyWarning';
import { ProgramDemandTrend } from '../insights/ProgramDemandTrend';
import { MarginHeatmap } from '../insights/MarginHeatmap';
import type { Project } from '../../types';
import { eff } from '../../utils/calculations';

// 리포트 (2026-08-27 매출 중심 → 고객사/강사/업체 인사이트 중심으로 재편)
// — 확정/예상 매출 요약카드, 월별 매출 현황 차트, 프로젝트 상태 분포 파이차트는 홈 Dashboard와
//   완전히 중복되는 내용이라 제거(같은 숫자를 두 화면에서 각자 계산해 이원화되는 문제도 있었음).
// — 대신 경영현황(관리자 전용)에 있던 리스크조기경보/프로그램수요트렌드/마진율히트맵을 공용
//   컴포넌트(src/components/insights/)로 분리해 여기서도 씀 — 코드 중복 없이 재사용.
// — "고객사별 매출 랭킹"은 Dashboard에 없는 이 페이지만의 고유 콘텐츠라 유지.

export function ReportsPage() {
  const { projects, loading, globalYear, setGlobalYear } = useAppData();
  const navigate = useNavigate();
  const year = globalYear;
  const setYear = setGlobalYear;

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(projectYear).filter((y): y is string => !!y))].sort().reverse();
    return ys;
  }, [projects]);

  const filtered = useMemo(() => {
    const base = activeProjects(projects);
    if (year === '전체') return base;
    return base.filter((p) => projectYear(p) === year);
  }, [projects, year]);

  // 고객사별 매출 (유효매출 + 매출분배 자식은 마스터 고객사로 귀속)
  const clientRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((p) => {
      const amount = eff(p);
      if (amount <= 0) return;
      const key = p.clientName || '(미지정)';
      map[key] = (map[key] ?? 0) + amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-400">
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          <option value="전체">전체 연도</option>
        </select>
        <span className="text-xs text-slate-400">
          고객사·강사·업체 기반 인사이트 · 매출 현황은 홈 대시보드에서 확인하세요
        </span>
      </div>

      <Card>
        <CardHeader title="고객사별 매출 랭킹 (매출분배는 메인 고객사 귀속)" icon={<BarChart3 className="h-4 w-4 text-slate-400" />} />
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={clientRevenue} layout="vertical" margin={{ left: 60 }}>
              <XAxis type="number" tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v: number) => [formatCompactKRW(v) + '원', '유효매출']} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} className="cursor-pointer"
                onClick={(d: any) => d?.name && navigate(`/projects?year=${year}&search=${encodeURIComponent(d.name)}`)} />
            </BarChart>
          </ResponsiveContainer>
          <p className="px-1 pb-1 text-[11px] text-slate-400">막대를 클릭하면 해당 고객사 프로젝트 목록으로 이동합니다</p>
        </div>
      </Card>

      <MarginHeatmap year={year} />

      <ProgramDemandTrend year={year} />

      <RiskEarlyWarning year={year} />

      <ClientPaymentLagSection />
    </div>
  );
}
