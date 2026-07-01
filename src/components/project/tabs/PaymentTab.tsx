import { useState } from 'react';
import type { Project, PaymentRequest } from '../../../types';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { paymentStatusStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';
import { ActionButton } from './_shared';
import { EmptyState } from '../../common/EmptyState';
import { ChevronDown, ChevronUp, CreditCard } from 'lucide-react';

function PaymentRow({ r, onUpdateRequest }: {
  r: PaymentRequest;
  onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const isVendor = r.payeeType === '업체';
  // 요청사항: 업체는 매입세금계산서 발행 확인 전에는 지급완료 처리 불가
  const vendorBlocking = isVendor && !r.vendorTaxInvoiceReceived;

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-5 py-3">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 font-medium text-slate-800 hover:text-blue-600">
            {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            {r.payeeName}
          </button>
          {r.memo && <div className="ml-5 text-xs font-normal text-slate-400">{r.memo}</div>}
        </td>
        <td className="px-3 py-3 text-slate-500">{r.payeeType}</td>
        <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
        <td className="px-3 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
        <td className="px-3 py-3"><StatusBadge label={r.status} style={paymentStatusStyle[r.status]} size="sm" /></td>
        <td className="px-3 py-3">
          {r.status === '지급대상' && (
            r.infoConfirmed
              ? <ActionButton onClick={() => onUpdateRequest(r.id, { status: '지급요청' })}>지급요청 생성</ActionButton>
              : <span className="text-xs text-amber-600">지급정보 확인 필요 →</span>
          )}
          {r.status === '지급요청' && (
            vendorBlocking
              ? <span className="text-xs text-amber-600">매입계산서 확인 필요 →</span>
              : <ActionButton tone="emerald" onClick={() => onUpdateRequest(r.id, { status: '지급완료' })}>지급완료 처리</ActionButton>
          )}
          {r.status === '지급완료' && <span className="text-xs text-green-600">✓ 지급완료</span>}
          {r.status === '보류' && <span className="text-xs text-slate-400">보류</span>}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* 1. 지급정보 확인 */}
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <CreditCard className="h-3.5 w-3.5" /> 지급 정보
                </p>
                <p className="text-sm text-slate-700">{r.payeeAccountInfo ?? <span className="text-red-500">등록된 계좌정보 없음 — 강사/업체 관리에서 확인 필요</span>}</p>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!r.infoConfirmed}
                    onChange={(e) => onUpdateRequest(r.id, { infoConfirmed: e.target.checked })}
                  />
                  지급정보(계좌 등) 확인 완료
                </label>
              </div>

              {/* 2. 업체 매입세금계산서 확인 */}
              {isVendor && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">매입세금계산서 (업체)</p>
                  {r.vendorTaxInvoiceReceived ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-600">✓ 발행 확인됨 ({formatDate(r.vendorTaxInvoiceDate)})</span>
                      <button onClick={() => onUpdateRequest(r.id, { vendorTaxInvoiceReceived: false, vendorTaxInvoiceDate: undefined })}
                        className="text-xs text-slate-400 underline hover:text-red-500">취소</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                      <button
                        onClick={() => onUpdateRequest(r.id, { vendorTaxInvoiceReceived: true, vendorTaxInvoiceDate: invoiceDate })}
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        발행 확인 처리
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PaymentTab({ project, requests, onUpdateRequest }:
  { project: Project; requests: PaymentRequest[]; onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void }) {
  const rows = requests.filter((r) => r.projectId === project.id);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
        지급 대상 ({rows.length}건)
        <span className="ml-2 text-xs font-normal text-slate-400">시행일 기준 익월 말일 지급 · 지급정보 확인 → (업체) 매입계산서 확인 → 지급요청 순서로 진행</span>
      </div>
      {rows.length === 0 ? <EmptyState title="지급 대상이 없습니다" /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">지급처</th><th className="px-3 py-2.5 font-medium">유형</th>
            <th className="px-3 py-2.5 text-right font-medium">금액</th><th className="px-3 py-2.5 font-medium">지급기한</th>
            <th className="px-3 py-2.5 font-medium">상태</th><th className="px-3 py-2.5 font-medium">처리</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => <PaymentRow key={r.id} r={r} onUpdateRequest={onUpdateRequest} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}
