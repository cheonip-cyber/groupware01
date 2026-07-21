import { profitRateLabel } from '../../utils/formatters';
import { activeProjects } from '../../utils/filters';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SortableTh, useSortableRows } from '../common/SortableTh';
import type { Project } from '../../types';

type BudgetSortKey = 'projectName' | 'contractAmount' | 'expectedCost' | 'actualCost' | 'expectedProfit' | 'profitRate';
const budgetSortValue = (p: Project, key: BudgetSortKey) => {
  switch (key) {
    case 'contractAmount': return p.contractAmount;
    case 'expectedCost': return p.expectedCost;
    case 'actualCost': return p.actualCost;
    case 'expectedProfit': return p.expectedProfit;
    case 'profitRate': return p.profitRate;
    default: return p.projectName;
  }
};

export function BudgetPage() {
  const { projects, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  const active = activeProjects(projects);
  const { sorted, sortKey, dir, onSort } = useSortableRows<Project, BudgetSortKey>(active, budgetSortValue);
  return (
    <Card>
      <CardHeader title="예산/비용 현황" icon={<Wallet className="h-4 w-4 text-slate-400" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="w-10 px-3 py-2.5 font-medium">No.</th>
            <SortableTh label="프로젝트" sortKey="projectName" active={sortKey === 'projectName'} dir={dir} onSort={onSort} className="px-5" />
            <SortableTh label="계약금액" sortKey="contractAmount" active={sortKey === 'contractAmount'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="예상비용" sortKey="expectedCost" active={sortKey === 'expectedCost'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="실지출" sortKey="actualCost" active={sortKey === 'actualCost'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="예상이익" sortKey="expectedProfit" active={sortKey === 'expectedProfit'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="이익률" sortKey="profitRate" active={sortKey === 'profitRate'} dir={dir} onSort={onSort} align="right" />
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((p, idx) => (
              <tr key={p.id} className="group hover:bg-slate-50">
                <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{idx + 1}</td>
                <td className="px-5 py-3">
                  <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                  <div className="text-xs text-slate-400">{p.clientName}</div>
                </td>
                <td className="px-3 py-3 text-right"><MoneyText value={p.contractAmount} /></td>
                <td className="px-3 py-3 text-right"><MoneyText value={p.expectedCost} /></td>
                <td className="px-3 py-3 text-right text-slate-500"><MoneyText value={p.actualCost > 0 ? p.actualCost : undefined} /></td>
                <td className={`px-3 py-3 text-right font-medium ${p.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <MoneyText value={p.expectedProfit} />
                </td>
                <td className={`px-3 py-3 text-right font-medium tabular-nums ${p.profitRate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {profitRateLabel(p)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
