import { useState } from 'react';
import type { Project } from '../../../types';
import { Section, Field } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { revenueStatusStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';

// 완료 처리 시 날짜를 선택할 수 있는 인라인 액션 (세금계산서 발행일 / 수금완료일 공용)
function DateCompleteAction({
  done, onComplete, onUndo, tone = 'blue', label,
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
        <Field label="제안금액">
          <InlineMoneySave value={project.initialEstimate} onSave={(v) => onUpdate({ initialEstimate: v })} />
        </Field>
        <Field label="VAT 구분">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${project.vatType === '별도' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
              {project.vatType ?? '포함'}
            </span>
            {/* 양방향 전환(그룹웨어 수정 → Notion 자동 반영) — 수정검토 지시 */}
            <button
              onClick={() => onUpdate({ vatType: project.vatType === '별도' ? '포함' : '별도' })}
              className="text-xs text-slate-400 underline hover:text-blue-600"
            >
              {project.vatType === '별도' ? '"포함"으로 변경' : '"별도"로 변경'}
            </button>
            {project.notionPageId && <span className="text-[10px] text-slate-300">변경 시 Notion에도 반영</span>}
          </div>
        </Field>
        <Field label="공급가액 (VAT 제외)"><MoneyText value={project.supplyAmount} /></Field>
        <Field label="VAT"><MoneyText value={project.vat} /></Field>
        <Field label="최종견적 (VAT 별도 입력분)">
          <span className="flex items-center gap-2">
            <InlineMoneySave value={project.finalEstimate ?? 0} onSave={(v) => onUpdate({ finalEstimate: v })} bold />
            <span className="text-[10px] text-slate-300">Notion "최종견적"과 동일 — VAT구분에 따라 아래 금액이 자동 계산됩니다</span>
          </span>
        </Field>
        <Field label="최종 계약금액 (VAT 포함 실수령액)"><MoneyText value={project.contractAmount} className="font-semibold" /></Field>
        <Field label="매출 월">{project.revenueMonth || '-'}</Field>
      </Section>
      <Section title="세금계산서 / 수금">
        <Field label="매출 상태"><StatusBadge label={project.revenueStatus} style={revenueStatusStyle[project.revenueStatus]} /></Field>

        {project.groupType === 'distribution' ? (
          <Field label="세금계산서 · 수금">
            <p className="text-xs text-slate-500">
              계열사별로 관리됩니다. 아래 <b>매출분배(계열사)</b> 섹션에서 확인·처리하세요.
              전 계열사가 완료되면 이 값이 자동으로 채워지고 노션에도 반영됩니다.
            </p>
          </Field>
        ) : (
          <>
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
          </>
        )}
        <Field label="입금 메모">
          <InlineTextSave value={project.clientPaymentMemo ?? ''} placeholder="입금 지연 사유·특이사항 (구 그룹웨어 입금 메모)"
            onSave={(v) => onUpdate({ clientPaymentMemo: v })} />
        </Field>
      </Section>
    </div>
  );
}

// 인라인 금액 저장 (숫자 입력, 값이 바뀌었을 때만 저장 버튼 노출)
function InlineMoneySave({ value, onSave, bold }: { value: number; onSave: (v: number) => void; bold?: boolean }) {
  const [v, setV] = useState(String(value ?? 0));
  const dirty = Number(v || 0) !== value;
  return (
    <span className="flex items-center gap-1.5">
      <input type="number" value={v} onChange={(e) => setV(e.target.value)}
        className={`w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400 ${bold ? 'font-semibold' : ''}`} />
      <span className="text-xs text-slate-400">원</span>
      {dirty && <button onClick={() => onSave(Number(v || 0))} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">저장</button>}
    </span>
  );
}

// 인라인 텍스트 저장 (입력 마찰 최소화 원칙: 상세화면 인라인 편집)
function InlineTextSave({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const dirty = v !== value;
  return (
    <span className="flex items-center gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        className="w-72 max-w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-400" />
      {dirty && <button onClick={() => onSave(v.trim())} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">저장</button>}
    </span>
  );
}
