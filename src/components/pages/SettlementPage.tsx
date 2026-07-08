import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { settlementStatusStyle } from '../../utils/statusConfig';
import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SettlementPage() {
  const { projects, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  const active = projects.filter((p) => p.projectStatus !== '취소/보류');
  return (
    <Card>
      <CardHeader title="정산/결산 현황" icon={<ClipboardCheck className="h-4 w-4 text-slate-400" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">프로젝트</th>
            <th className="px-3 py-2.5 font-medium">결산상태</th>
            <th className="px-3 py-2.5 font-medium">보고서</th>
            <th className="px-3 py-2.5 font-medium">거래명세서</th>
            <th className="px-3 py-2.5 font-medium">세금계산서</th>
            <th className="px-3 py-2.5 font-medium">수금</th>
            <th className="px-3 py-2.5 font-medium">지급완료</th>
            <th className="px-3 py-2.5 text-right font-medium">최종이익</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {active.map((p) => {
              const ok = 'text-emerald-600', no = 'text-red-400';
              return (
                <tr key={p.id} className="group hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                    <div className="text-xs text-slate-400">{p.clientName}</div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge label={p.settlementStatus} style={settlementStatusStyle[p.settlementStatus]} size="sm" /></td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.reportCompleted ? ok : no}`}>{p.reportCompleted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.statementSubmitted ? ok : no}`}>{p.statementSubmitted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.taxInvoiceIssued ? ok : no}`}>{p.taxInvoiceIssued ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.collectionCompleted ? ok : no}`}>{p.collectionCompleted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.paymentCompleted ? ok : no}`}>{p.paymentCompleted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-right font-medium ${p.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <MoneyText value={p.expectedProfit} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
