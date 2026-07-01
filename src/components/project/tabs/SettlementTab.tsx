import type { Project, PaymentRequest } from '../../../types';
import { Section, Field, ActionButton } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { settlementStatusStyle } from '../../../utils/statusConfig';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

// 확인 상태 배지 (완료/미완료/부분) 공용 컴포넌트
function CheckRow({ label, state, detail }: { label: string; state: 'done' | 'pending' | 'partial'; detail?: string }) {
  const cfg = {
    done: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, text: '완료', cls: 'text-emerald-600' },
    partial: { icon: <Clock className="h-4 w-4 text-amber-500" />, text: '일부 완료', cls: 'text-amber-600' },
    pending: { icon: <XCircle className="h-4 w-4 text-slate-300" />, text: '미완료', cls: 'text-slate-400' },
  }[state];
  return (
    <div className="flex items-center justify-between border-b border-slate-50 px-1 py-2.5 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${cfg.cls}`}>
        {cfg.icon}{cfg.text}{detail && <span className="text-xs font-normal text-slate-400">({detail})</span>}
      </span>
    </div>
  );
}

// 요청사항: "시행일 기준 익월 말일" 지급 기한 도래 여부
function computeDueMonthInfo(sessionDate?: string): { dueLabel: string; isDueMonth: boolean } | null {
  if (!sessionDate) return null;
  const d = new Date(sessionDate);
  if (isNaN(d.getTime())) return null;
  const due = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const now = new Date();
  const isDueMonth = now.getFullYear() === due.getFullYear() && now.getMonth() === due.getMonth();
  const dueLabel = `${due.getFullYear()}.${String(due.getMonth() + 1).padStart(2, '0')} 말일`;
  return { dueLabel, isDueMonth };
}

export function SettlementTab({ project, requests, onUpdate }:
  { project: Project; requests: PaymentRequest[]; onUpdate: (patch: Partial<Project>) => void }) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';

  const handleSettlementDone = () =>
    onUpdate({ settlementStatus: '결산완료', projectStatus: '완료' });
  const handleSettlementUndo = () =>
    onUpdate({ settlementStatus: '정산중', projectStatus: '보고/정산' });

  // 지급업체(업체) 매입세금계산서 발행 확인
  const vendorRows = requests.filter((r) => r.payeeType === '업체');
  const vendorAllDone = vendorRows.length > 0 && vendorRows.every((r) => r.vendorTaxInvoiceReceived);
  const vendorSomeDone = vendorRows.some((r) => r.vendorTaxInvoiceReceived);
  const vendorState: 'done' | 'pending' | 'partial' =
    vendorRows.length === 0 ? 'done' : vendorAllDone ? 'done' : vendorSomeDone ? 'partial' : 'pending';

  const dueInfo = computeDueMonthInfo(project.startDate);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="정산 확인 상태">
        <CheckRow label="고객사 세금계산서 발행" state={project.taxInvoiceIssued ? 'done' : 'pending'} />
        <CheckRow label="고객사 수금" state={project.collectionCompleted ? 'done' : 'pending'} />
        <CheckRow
          label="지급업체 매입세금계산서 발행"
          state={vendorState}
          detail={vendorRows.length > 0 ? `${vendorRows.filter((r) => r.vendorTaxInvoiceReceived).length}/${vendorRows.length}건` : '해당없음'}
        />
        {dueInfo && (
          <CheckRow
            label="지급월 해당 여부"
            state={dueInfo.isDueMonth ? 'done' : 'pending'}
            detail={`지급기한 ${dueInfo.dueLabel}`}
          />
        )}
        <div className="pt-2">
          <Field label="결산 상태">
            <StatusBadge label={project.settlementStatus} style={settlementStatusStyle[project.settlementStatus]} />
          </Field>
        </div>
      </Section>

      <Section title="최종 손익 / 결산">
        <Field label="제안금액"><MoneyText value={project.initialEstimate} /></Field>
        <Field label="계약금액"><MoneyText value={project.contractAmount} /></Field>
        <Field label="실제 지출"><MoneyText value={project.actualCost > 0 ? project.actualCost : project.expectedCost} /></Field>
        <Field label="최종 이익">
          <MoneyText value={project.expectedProfit} className={`font-bold ${profitTone}`} />
        </Field>
        <Field label="이익률">
          <span className={`font-bold ${profitTone}`}>{project.profitRate}%</span>
        </Field>
        <Field label="결산 완료">
          <ActionButton
            done={project.settlementStatus === '결산완료'}
            tone="emerald"
            onClick={handleSettlementDone}
            onUndo={handleSettlementUndo}
          >
            결산완료 처리
          </ActionButton>
        </Field>
      </Section>
    </div>
  );
}
