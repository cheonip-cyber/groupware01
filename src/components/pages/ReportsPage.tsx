import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { countProjectsByStatus } from '../../utils/calculations';
import { projectStatusChartColor } from '../../utils/statusConfig';
import { formatCompactKRW } from '../../utils/formatters';
import { BarChart3 } from 'lucide-react';

export function ReportsPage() {
  const { projects, clients, loading } = useAppData();

  const clientRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    projects.filter((p) => p.projectStatus !== '취소/보류').forEach((p) => {
      map[p.clientName] = (map[p.clientName] ?? 0) + p.contractAmount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [projects]);

  const statusData = useMemo(() => {
    const counts = countProjectsByStatus(projects);
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [projects]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="고객사별 매출 랭킹" icon={<BarChart3 className="h-4 w-4 text-slate-400" />} />
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientRevenue} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number) => [formatCompactKRW(v) + '원', '계약금액']} />
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

      <Card className="p-5">
        <p className="text-sm font-semibold text-slate-700 mb-1">📊 리포트 안내</p>
        <p className="text-sm text-slate-500">
          현재 샘플 데이터 모드입니다. Supabase 연동 후 월별 매출 추이, 강사별 지급 현황, 세금 보고 자료 등 상세 리포트가 활성화됩니다.
        </p>
        <p className="mt-1 text-xs text-slate-400">총 {projects.length}개 프로젝트 · {clients.length}개 고객사 데이터 로드됨</p>
      </Card>
    </div>
  );
}
