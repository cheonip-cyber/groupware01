import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { Project } from '../../types';
import { countProjectsByStatus } from '../../utils/calculations';
import { projectStatusChartColor } from '../../utils/statusConfig';
import { Card, CardHeader } from '../common/Card';
import { PieChart as PieIcon } from 'lucide-react';

export function StatusChart({ projects }: { projects: Project[] }) {
  const counts = countProjectsByStatus(projects);
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <Card className="h-full">
      <CardHeader title="프로젝트 상태 분포" icon={<PieIcon className="h-4 w-4 text-slate-400" />} />
      <div className="h-64 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={projectStatusChartColor[d.name as keyof typeof projectStatusChartColor]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => [`${v}건`, '']} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
