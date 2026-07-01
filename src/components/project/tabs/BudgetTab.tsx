import { useState } from 'react';
import type { Project, PaymentRequest, Instructor } from '../../../types';
import type { NewProjectCostInput } from '../../../services/dataSource';
import { Section, Field } from './_shared';
import { MoneyText } from '../../common/MoneyText';
import { EmptyState } from '../../common/EmptyState';
import { Plus } from 'lucide-react';

const CATEGORIES = ['강사비', '인건비', '교육비', '대관비', '기타'] as const;

export function BudgetTab({ project, requests, instructors, onAddCost }: {
  project: Project;
  requests: PaymentRequest[];
  instructors: Instructor[];
  onAddCost: (input: NewProjectCostInput) => Promise<void>;
}) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('강사비');
  const [payeeType, setPayeeType] = useState<'instructor' | 'company' | 'etc'>('instructor');
  const [instructorId, setInstructorId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [isCard, setIsCard] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCategory('강사비'); setPayeeType('instructor'); setInstructorId('');
    setPayeeName(''); setAmount(''); setIsCard(false); setOpen(false);
  };

  const handleSubmit = async () => {
    const finalPayeeName = payeeType === 'instructor'
      ? (instructors.find((i) => i.id === instructorId)?.name ?? payeeName)
      : payeeName;
    if (!finalPayeeName || !amount) return;
    setSaving(true);
    await onAddCost({
      category,
      payeeType,
      payeeId: payeeType === 'instructor' ? instructorId : undefined,
      payeeName: finalPayeeName,
      budgetAmount: Number(amount),
      isCardPayment: isCard,
    });
    setSaving(false);
    resetForm();
  };

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="예산 구성 (원가 항목 합계)">
          <Field label="강사료 예산"><MoneyText value={project.trainerFeeBudget} /></Field>
          <Field label="운영비 예산"><MoneyText value={project.operationBudget} /></Field>
          <Field label="교구재 예산"><MoneyText value={project.materialBudget} /></Field>
          <Field label="제작물 예산"><MoneyText value={project.productionBudget} /></Field>
          <Field label="기타 비용"><MoneyText value={project.etcCost} /></Field>
          <Field label="총 예산"><MoneyText value={project.expectedCost} className="font-semibold" /></Field>
        </Section>
        <Section title="손익">
          <Field label="실제 지출"><MoneyText value={project.actualCost} /></Field>
          <Field label="계약금액"><MoneyText value={project.contractAmount} /></Field>
          <Field label="예상 이익"><MoneyText value={project.expectedProfit} className={`font-semibold ${profitTone}`} /></Field>
          <Field label="이익률"><span className={`font-semibold ${profitTone}`}>{project.profitRate}%</span></Field>
        </Section>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-semibold text-slate-700">예산 항목 ({requests.length}건)</span>
          <button onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> 예산 항목 추가
          </button>
        </div>

        {open && (
          <div className="border-b border-slate-100 bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={payeeType} onChange={(e) => setPayeeType(e.target.value as typeof payeeType)} className={inputCls}>
                <option value="instructor">강사</option>
                <option value="company">업체</option>
                <option value="etc">기타</option>
              </select>
              {payeeType === 'instructor' ? (
                <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className={`${inputCls} col-span-2`}>
                  <option value="">강사 선택</option>
                  {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              ) : (
                <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="지급대상명"
                  className={`${inputCls} col-span-2`} />
              )}
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="예산금액"
                className={inputCls} />
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={isCard} onChange={(e) => setIsCard(e.target.checked)} />
                카드결제(지급요청 제외)
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSubmit} disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중…' : '저장'}
              </button>
              <button onClick={resetForm} className="rounded-lg px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-100">취소</button>
            </div>
          </div>
        )}

        {requests.length === 0 ? <EmptyState title="등록된 예산 항목이 없습니다" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-5 py-2.5 font-medium">항목</th>
              <th className="px-3 py-2.5 font-medium">지급대상</th>
              <th className="px-3 py-2.5 text-right font-medium">예산금액</th>
              <th className="px-3 py-2.5 font-medium">상태</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5 text-slate-600">{r.payeeType}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{r.payeeName}</td>
                  <td className="px-3 py-2.5 text-right"><MoneyText value={r.amount} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
