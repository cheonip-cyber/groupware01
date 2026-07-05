import { profitRateLabel } from '../../utils/formatters';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BudgetPage() {
  const { projects, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  const active = projects.filter((p) => p.projectStatus !== '취소/보류');
  return (
    <Card>
      <CardHeader title="예산/비용 현황" icon={<Wallet className="h-4 w-4 text-slate-400" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">프로젝트</th>
            <th className="px-3 py-2.5 text-right font-medium">계약금액</th>
            <th className="px-3 py-2.5 text-right font-medium">예상비용</th>
            <th className="px-3 py-2.5 text-right font-medium">실지출</th>
            <th className="px-3 py-2.5 text-right font-medium">예상이익</th>
            <th className="px-3 py-2.5 text-right font-medium">이익률</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {active.map((p) => (
              <tr key={p.id} className="group hover:bg-slate-50">
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
