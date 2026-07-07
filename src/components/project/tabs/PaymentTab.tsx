import { useState } from 'react';
import type { Project, PaymentRequest } from '../../../types';
import { MoneyText } from '../../common/MoneyText';
import { formatDate } from '../../../utils/formatters';
import { EmptyState } from '../../common/EmptyState';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PaymentDetailModal } from '../PaymentDetailModal';

// 처리 상태 텍스트 (지급요청 필요 / 지급요청 완료 / 지급완료)
function processLabel(r: PaymentRequest): { text: string; cls: string } {
  if (r.status === '지급완료') return { text: '지급완료', cls: 'text-emerald-600 font-semibold' };
  if (r.status === '지급요청') return { text: '지급요청 완료', cls: 'text-blue-600 font-medium' };
  if (r.status === '보류') return { text: '보류', cls: 'text-slate-400' };
  return { text: '지급요청 필요', cls: 'text-amber-600 font-medium' };
}

function PaymentRow({ r, onUpdateRequest }: {
  r: PaymentRequest;
  onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void;
}) {
  const [detail, setDetail] = useState(false);
  const [open, setOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const isVendor = r.payeeType === '업체';
  const proc = processLabel(r);

  return (
    <>
      {/* 행 어디를 클릭해도 지급 상세 정보 팝업 (구 화면 방식) */}
      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(true)}>
        <td className="px-5 py-3">
          <span className="font-medium text-slate-800">{r.payeeName}</span>
          {r.memo && <div className="text-xs font-normal text-slate-400">{r.memo}</div>}
        </td>
        <td className="px-3 py-3 text-slate-500">{r.payeeType}</td>
        <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
        <td className="px-3 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
        <td className={`px-3 py-3 text-xs ${proc.cls}`}>{proc.text}</td>
        {isVendor && (
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
              매입계산서 {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </td>
        )}
      </tr>
      {detail && <PaymentDetailModal r={r} onClose={() => setDetail(false)} onUpdateRequest={onUpdateRequest} />}
      {isVendor && open && (
        <tr className="bg-slate-50" onClick={(e) => e.stopPropagation()}>
          <td colSpan={6} className="px-5 py-3">
            <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-3">
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
          </td>
        </tr>
      )}
    </>
  );
}

export function PaymentTab({ project, requests, onUpdateRequest }:
  { project: Project; requests: PaymentRequest[]; onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void }) {
  // 카드사용 내역은 예산/비용 탭에서만 확인 — 지급 탭에는 표시하지 않는다
  const rows = requests.filter((r) => r.projectId === project.id && !r.isCardPayment);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
        지급 대상 ({rows.length}건)
        <span className="ml-2 text-xs font-normal text-slate-400">시행일 기준 익월 말일 지급 · 행을 클릭하면 지급 상세 정보를 확인·처리할 수 있습니다</span>
      </div>
      {rows.length === 0 ? <EmptyState title="지급 대상이 없습니다" /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">지급처</th><th className="px-3 py-2.5 font-medium">유형</th>
            <th className="px-3 py-2.5 text-right font-medium">금액</th><th className="px-3 py-2.5 font-medium">지급기한</th>
            <th className="px-3 py-2.5 font-medium">상태</th><th className="px-3 py-2.5 font-medium"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => <PaymentRow key={r.id} r={r} onUpdateRequest={onUpdateRequest} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}
