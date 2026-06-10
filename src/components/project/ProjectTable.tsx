import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, revenueStatusStyle, paymentStatusStyle, settlementStatusStyle, priorityStyle } from '../../utils/statusConfig';
import { formatDateRange } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';

export function ProjectTable({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <EmptyState title="조건에 맞는 프로젝트가 없습니다" desc="필터를 변경해 보세요" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="px-4 py-3 font-medium">프로젝트 / 고객사</th>
            <th className="px-3 py-3 font-medium">교육일정</th>
            <th className="px-3 py-3 font-medium">우선순위</th>
            <th className="px-3 py-3 font-medium">프로젝트</th>
            <th className="px-3 py-3 font-medium">매출</th>
            <th className="px-3 py-3 font-medium">지급</th>
            <th className="px-3 py-3 font-medium">결산</th>
            <th className="px-3 py-3 text-right font-medium">계약금액</th>
            <th className="px-3 py-3 text-right font-medium">이익률</th>
            <th className="px-3 py-3 font-medium">담당</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((p) => (
            <tr key={p.id} className="group hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                <div className="text-xs text-slate-400">{p.clientName}{p.riskFlags.length > 0 && <span className="ml-2 text-red-500">● 주의</span>}</div>
              </td>
              <td className="px-3 py-3 text-xs text-slate-500">{formatDateRange(p.startDate, p.endDate)}</td>
              <td className="px-3 py-3"><StatusBadge label={p.priority} style={priorityStyle[p.priority]} size="sm" /></td>
              <td className="px-3 py-3"><StatusBadge label={p.projectStatus} style={projectStatusStyle[p.projectStatus]} size="sm" /></td>
              <td className="px-3 py-3"><StatusBadge label={p.revenueStatus} style={revenueStatusStyle[p.revenueStatus]} size="sm" /></td>
              <td className="px-3 py-3"><StatusBadge label={p.paymentStatus} style={paymentStatusStyle[p.paymentStatus]} size="sm" /></td>
              <td className="px-3 py-3"><StatusBadge label={p.settlementStatus} style={settlementStatusStyle[p.settlementStatus]} size="sm" /></td>
              <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={p.contractAmount} /></td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.profitRate}%</td>
              <td className="px-3 py-3 text-xs text-slate-500">{p.managerName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
