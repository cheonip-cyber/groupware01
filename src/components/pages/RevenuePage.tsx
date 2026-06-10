import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { revenueStatusStyle } from '../../utils/statusConfig';
import { formatDate } from '../../utils/formatters';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';

export function RevenuePage() {
  const { projects, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  const active = projects.filter((p) => p.projectStatus !== '취소/보류');
  const totalRev = active.reduce((s, p) => s + p.contractAmount, 0);
  const collected = active.filter((p) => p.collectionCompleted).reduce((s, p) => s + p.contractAmount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '전체 계약금액', val: totalRev },
          { label: '수금완료', val: collected },
          { label: '미수금', val: totalRev - collected },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums"><MoneyText value={k.val} compact /></p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader title="매출/계약 현황" icon={<Receipt className="h-4 w-4 text-slate-400" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-5 py-2.5 font-medium">프로젝트</th>
              <th className="px-3 py-2.5 font-medium">고객사</th>
              <th className="px-3 py-2.5 text-right font-medium">계약금액</th>
              <th className="px-3 py-2.5 text-right font-medium">공급가액</th>
              <th className="px-3 py-2.5 font-medium">매출상태</th>
              <th className="px-3 py-2.5 font-medium">세금계산서</th>
              <th className="px-3 py-2.5 font-medium">수금예정일</th>
              <th className="px-3 py-2.5 font-medium">수금완료일</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {active.map((p) => (
                <tr key={p.id} className="group hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{p.clientName}</td>
                  <td className="px-3 py-3 text-right"><MoneyText value={p.contractAmount} /></td>
                  <td className="px-3 py-3 text-right"><MoneyText value={p.supplyAmount} /></td>
                  <td className="px-3 py-3"><StatusBadge label={p.revenueStatus} style={revenueStatusStyle[p.revenueStatus]} size="sm" /></td>
                  <td className="px-3 py-3">
                    <span className={p.taxInvoiceIssued ? 'text-emerald-600' : 'text-red-500'}>{p.taxInvoiceIssued ? '발행완료' : '미발행'}</span>
                  </td>
                  <td className="px-3 py-3 text-slate-500 text-xs">{formatDate(p.collectionDueDate)}</td>
                  <td className="px-3 py-3 text-slate-500 text-xs">{formatDate(p.collectionDoneDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
