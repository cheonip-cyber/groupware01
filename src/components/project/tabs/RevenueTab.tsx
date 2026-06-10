import type { Project } from '../../../types';
import { Section, Field, ActionButton } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { revenueStatusStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';

export function RevenueTab({ project, onUpdate }:
  { project: Project; onUpdate: (patch: Partial<Project>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="계약 / 금액">
        <Field label="최초 견적"><MoneyText value={project.initialEstimate} /></Field>
        <Field label="최종 계약금액"><MoneyText value={project.contractAmount} className="font-semibold" /></Field>
        <Field label="공급가액"><MoneyText value={project.supplyAmount} /></Field>
        <Field label="VAT"><MoneyText value={project.vat} /></Field>
        <Field label="총액"><MoneyText value={project.totalAmount} className="font-semibold" /></Field>
      </Section>
      <Section title="세금계산서 / 수금">
        <Field label="매출 상태"><StatusBadge label={project.revenueStatus} style={revenueStatusStyle[project.revenueStatus]} /></Field>
        <Field label="세금계산서 발행">
          <div className="flex items-center gap-2">
            <span className={project.taxInvoiceIssued ? 'text-emerald-600' : 'text-slate-400'}>{project.taxInvoiceIssued ? '발행완료' : '미발행'}</span>
            <ActionButton done={project.taxInvoiceIssued} onClick={() => onUpdate({ taxInvoiceIssued: true, revenueStatus: '세금계산서 발행완료' })}>세금계산서 발행완료 처리</ActionButton>
          </div>
        </Field>
        <Field label="수금 예정일">{formatDate(project.collectionDueDate)}</Field>
        <Field label="수금 완료일">{formatDate(project.collectionDoneDate)}</Field>
        <Field label="수금 상태">
          <div className="flex items-center gap-2">
            <span className={project.collectionCompleted ? 'text-emerald-600' : 'text-slate-400'}>{project.collectionCompleted ? '수금완료' : '수금대기'}</span>
            <ActionButton tone="emerald" done={project.collectionCompleted}
              onClick={() => onUpdate({ collectionCompleted: true, revenueStatus: '수금완료', collectionDoneDate: new Date().toISOString().slice(0, 10) })}>수금완료 처리</ActionButton>
          </div>
        </Field>
      </Section>
    </div>
  );
}
