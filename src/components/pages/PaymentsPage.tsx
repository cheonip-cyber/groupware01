import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { paymentStatusStyle } from '../../utils/statusConfig';
import { formatDate } from '../../utils/formatters';
import { CreditCard } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export function PaymentsPage() {
  const { paymentRequests, loading, updatePaymentRequest } = useAppData();
  const pending = paymentRequests.filter((r) => r.status === '지급대상' || r.status === '지급요청');
  const done = paymentRequests.filter((r) => r.status === '지급완료');

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const Table = ({ rows }: { rows: typeof paymentRequests }) => (
    rows.length === 0 ? <EmptyState title="해당 지급 건이 없습니다" /> : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">지급처</th>
            <th className="px-3 py-2.5 font-medium">유형</th>
            <th className="px-3 py-2.5 font-medium">프로젝트</th>
            <th className="px-3 py-2.5 text-right font-medium">금액</th>
            <th className="px-3 py-2.5 font-medium">지급예정일</th>
            <th className="px-3 py-2.5 font-medium">상태</th>
            <th className="px-3 py-2.5 font-medium">처리</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{r.payeeName}</td>
                <td className="px-3 py-3 text-slate-500">{r.payeeType}</td>
                <td className="px-3 py-3 text-xs text-slate-500 max-w-[200px] truncate">{r.projectName}</td>
                <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
                <td className="px-3 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
                <td className="px-3 py-3"><StatusBadge label={r.status} style={paymentStatusStyle[r.status]} size="sm" /></td>
                <td className="px-3 py-3 flex gap-1">
                  {r.status === '지급대상' && (
                    <button onClick={() => updatePaymentRequest(r.id, { status: '지급요청' })}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">지급요청 생성</button>
                  )}
                  {r.status === '지급요청' && (
                    <button onClick={() => updatePaymentRequest(r.id, { status: '지급완료' })}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">지급완료 처리</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={`지급 대기 (${pending.length}건)`} icon={<CreditCard className="h-4 w-4 text-amber-500" />} />
        <Table rows={pending} />
      </Card>
      <Card>
        <CardHeader title={`지급 완료 (${done.length}건)`} icon={<CreditCard className="h-4 w-4 text-emerald-500" />} />
        <Table rows={done} />
      </Card>
    </div>
  );
}
