import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { Card, CardHeader } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, revenueStatusStyle, paymentStatusStyle, settlementStatusStyle } from '../../utils/statusConfig';
import { formatDateRange } from '../../utils/formatters';
import { Table2, ArrowUpRight } from 'lucide-react';

export function ProjectSummaryTable({ projects }: { projects: Project[] }) {
  const rows = [...projects]
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    .slice(0, 8);
  return (
    <Card>
      <CardHeader title="프로젝트 요약" icon={<Table2 className="h-4 w-4 text-slate-400" />}
        action={<Link to="/projects" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">전체 보기 <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-5 py-2.5 font-medium">프로젝트 / 고객사</th>
              <th className="px-3 py-2.5 font-medium">교육일정</th>
              <th className="px-3 py-2.5 font-medium">프로젝트</th>
              <th className="px-3 py-2.5 font-medium">매출</th>
              <th className="px-3 py-2.5 font-medium">지급</th>
              <th className="px-3 py-2.5 font-medium">결산</th>
              <th className="px-3 py-2.5 text-right font-medium">계약금액</th>
              <th className="px-3 py-2.5 font-medium">다음 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((p) => (
              <tr key={p.id} className="group hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                  <div className="text-xs text-slate-400">{p.clientName} · {p.managerName}</div>
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">{formatDateRange(p.startDate, p.endDate)}</td>
                <td className="px-3 py-3"><StatusBadge label={p.projectStatus} style={projectStatusStyle[p.projectStatus]} size="sm" /></td>
                <td className="px-3 py-3"><StatusBadge label={p.revenueStatus} style={revenueStatusStyle[p.revenueStatus]} size="sm" /></td>
                <td className="px-3 py-3"><StatusBadge label={p.paymentStatus} style={paymentStatusStyle[p.paymentStatus]} size="sm" /></td>
                <td className="px-3 py-3"><StatusBadge label={p.settlementStatus} style={settlementStatusStyle[p.settlementStatus]} size="sm" /></td>
                <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={p.contractAmount} /></td>
                <td className="px-3 py-3 text-xs text-slate-500">{p.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
