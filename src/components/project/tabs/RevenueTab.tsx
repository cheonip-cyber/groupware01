import { useState } from 'react';
import type { Project } from '../../../types';
import { Section, Field } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { revenueStatusStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';

// 완료 처리 시 날짜를 선택할 수 있는 인라인 액션 (세금계산서 발행일 / 수금완료일 공용)
function DateCompleteAction({
  done, dateValue, onComplete, onUndo, tone = 'blue', label,
}: {
  done: boolean;
  dateValue?: string;
  onComplete: (date: string) => void;
  onUndo: () => void;
  tone?: 'blue' | 'emerald';
  label: string;
}) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const toneCls = tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700';

  if (done) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">✓ 완료됨</span>
        <button onClick={onUndo} className="text-xs text-slate-400 underline hover:text-red-500">취소</button>
      </span>
    );
  }

  if (picking) {
    return (
      <span className="inline-flex items-center gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
        <button onClick={() => { onComplete(date); setPicking(false); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${toneCls}`}>확인</button>
        <button onClick={() => setPicking(false)} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
      </span>
    );
  }

  return (
    <button onClick={() => setPicking(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${toneCls}`}>
      {label}
    </button>
  );
}

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
        <Field label="매출 월">{project.revenueMonth || '-'}</Field>
      </Section>
      <Section title="세금계산서 / 수금">
        <Field label="매출 상태"><StatusBadge label={project.revenueStatus} style={revenueStatusStyle[project.revenueStatus]} /></Field>

        <Field label="세금계산서 발행">
          <div className="flex items-center gap-2">
            <span className={project.taxInvoiceIssued ? 'text-emerald-600' : 'text-slate-400'}>{project.taxInvoiceIssued ? '발행완료' : '미발행'}</span>
            <DateCompleteAction
              done={project.taxInvoiceIssued}
              dateValue={project.taxInvoiceDate}
              label="세금계산서 발행완료 처리"
              onComplete={(date) => onUpdate({ taxInvoiceIssued: true, taxInvoiceDate: date })}
              onUndo={() => onUpdate({ taxInvoiceIssued: false, taxInvoiceDate: undefined })}
            />
          </div>
        </Field>
        <Field label="발행일">{formatDate(project.taxInvoiceDate)}</Field>

        <Field label="수금 상태">
          <div className="flex items-center gap-2">
            <span className={project.collectionCompleted ? 'text-emerald-600' : 'text-slate-400'}>{project.collectionCompleted ? '수금완료' : '수금대기'}</span>
            <DateCompleteAction
              done={project.collectionCompleted}
              dateValue={project.collectionDoneDate}
              tone="emerald"
              label="수금완료 처리"
              onComplete={(date) => onUpdate({ collectionCompleted: true, collectionDoneDate: date })}
              onUndo={() => onUpdate({ collectionCompleted: false, collectionDoneDate: undefined })}
            />
          </div>
        </Field>
        <Field label="수금 완료일">{formatDate(project.collectionDoneDate)}</Field>
      </Section>
    </div>
  );
}
