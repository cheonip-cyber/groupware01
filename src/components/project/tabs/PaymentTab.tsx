import type { Project, PaymentRequest } from '../../../types';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { paymentStatusStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';
import { ActionButton } from './_shared';
import { EmptyState } from '../../common/EmptyState';

export function PaymentTab({ project, requests, onUpdateRequest }:
  { project: Project; requests: PaymentRequest[]; onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void }) {
  const rows = requests.filter((r) => r.projectId === project.id);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">지급 대상 ({rows.length}건)</div>
      {rows.length === 0 ? <EmptyState title="지급 대상이 없습니다" /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">지급처</th><th className="px-3 py-2.5 font-medium">유형</th>
            <th className="px-3 py-2.5 text-right font-medium">금액</th><th className="px-3 py-2.5 font-medium">지급예정일</th>
            <th className="px-3 py-2.5 font-medium">상태</th><th className="px-3 py-2.5 font-medium">처리</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{r.payeeName}{r.memo && <div className="text-xs font-normal text-slate-400">{r.memo}</div>}</td>
                <td className="px-3 py-3 text-slate-500">{r.payeeType}</td>
                <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
                <td className="px-3 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
                <td className="px-3 py-3"><StatusBadge label={r.status} style={paymentStatusStyle[r.status]} size="sm" /></td>
                <td className="px-3 py-3">
                  {r.status === '지급대상' && <ActionButton onClick={() => onUpdateRequest(r.id, { status: '지급요청' })}>지급요청 생성</ActionButton>}
                  {r.status === '지급요청' && <ActionButton tone="emerald" onClick={() => onUpdateRequest(r.id, { status: '지급완료' })}>지급완료 처리</ActionButton>}
                  {r.status === '지급완료' && <span className="text-xs text-green-600">✓ 지급완료</span>}
                  {r.status === '보류' && <span className="text-xs text-slate-400">보류</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
