import { profitRateLabel } from '../../../utils/formatters';
import { useMemo, useState } from 'react';
import type { Project, PaymentRequest, Instructor, Company } from '../../../types';
import type { NewProjectCostInput } from '../../../services/dataSource';
import { Section, Field } from './_shared';
import { MoneyText } from '../../common/MoneyText';
import { EmptyState } from '../../common/EmptyState';
import { Plus, Trash2, Info, X } from 'lucide-react';

const CATEGORIES = ['강사비', '인건비', '교육비', '대관비', '기타'] as const;

// 강사/업체 검색형 선택 + 세부정보 확인 팝업
function PayeePicker({
  payeeType, instructors, companies, selectedId, onSelect, onTypeChange,
}: {
  payeeType: 'instructor' | 'company';
  instructors: Instructor[];
  companies: Company[];
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  /** 통합 검색에서 다른 유형을 선택했을 때 지급유형을 자동 전환 */
  onTypeChange: (t: 'instructor' | 'company') => void;
}) {
  const [query, setQuery] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 통합 검색: 강사와 업체(대표자명 포함)를 함께 검색 — 같은 이름이 양쪽에 등록된 경우 배지로 구분해 선택
    const instr = instructors
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.phone ?? '').includes(q))
      .map((i) => ({ kind: 'instructor' as const, id: i.id, label: i.name, sub: i.phone ?? '' }));
    const comp = companies
      .filter((c) => !q || c.companyName.toLowerCase().includes(q) || (c.ceoName ?? '').toLowerCase().includes(q))
      .map((c) => ({ kind: 'company' as const, id: c.id, label: c.companyName, sub: c.ceoName ? `대표 ${c.ceoName}` : '' }));
    // 현재 선택된 유형을 앞에 배치하되 양쪽 모두 노출
    const ordered = payeeType === 'instructor' ? [...instr, ...comp] : [...comp, ...instr];
    return ordered.slice(0, 10);
  }, [query, payeeType, instructors, companies]);

  const selected = payeeType === 'instructor'
    ? instructors.find((i) => i.id === selectedId)
    : companies.find((c) => c.id === selectedId);

  // 동명이인/강사-업체 중복 여부 힌트
  const dupWarning = useMemo(() => {
    if (!selected) return null;
    const name = payeeType === 'instructor' ? (selected as Instructor).name : (selected as Company).companyName;
    const sameNameInstructor = instructors.filter((i) => i.name === name).length;
    const sameNameCompany = companies.filter((c) => c.companyName === name).length;
    if (sameNameInstructor > 1 || sameNameCompany > 1) return '동일한 이름이 여러 건 존재합니다 — 세부정보로 반드시 확인하세요.';
    if (sameNameInstructor > 0 && sameNameCompany > 0) return '같은 이름이 강사·업체 양쪽에 모두 존재합니다 — 대상 확인 필요.';
    return null;
  }, [selected, payeeType, instructors, companies]);

  return (
    <div className="col-span-2 relative">
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="flex-1 truncate font-medium text-slate-800">
            {payeeType === 'instructor' ? (selected as Instructor).name : (selected as Company).companyName}
          </span>
          <button type="button" onClick={() => setShowDetail(true)} className="text-slate-400 hover:text-blue-600" title="세부정보 확인">
            <Info className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onSelect('', '')} className="text-slate-400 hover:text-red-500" title="선택 해제">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색 (강사·업체·대표자명 통합)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          {query && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400">검색 결과 없음</div>
              ) : results.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  onClick={() => { if (r.kind !== payeeType) onTypeChange(r.kind); onSelect(r.id, r.label); setQuery(''); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    r.kind === 'instructor' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                    {r.kind === 'instructor' ? '강사' : '업체'}
                  </span>
                  <span className="flex-1 truncate font-medium text-slate-800">{r.label}</span>
                  <span className="text-xs text-slate-400">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {dupWarning && <p className="mt-1 text-[11px] text-amber-600">⚠ {dupWarning}</p>}

      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowDetail(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">세부정보 확인</h4>
              <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <dl className="space-y-2 text-sm">
              {payeeType === 'instructor' ? (
                <>
                  <Row label="이름" value={(selected as Instructor).name} />
                  <Row label="연락처" value={(selected as Instructor).phone} />
                  <Row label="이메일" value={(selected as Instructor).email} />
                  <Row label="은행" value={(selected as Instructor).bankName} />
                  <Row label="계좌번호" value={(selected as Instructor).accountNumber} sensitive />
                  <Row label="주민등록번호" value={(selected as Instructor).residentNumber} sensitive />
                </>
              ) : (
                <>
                  <Row label="업체명" value={(selected as Company).companyName} />
                  <Row label="대표자명" value={(selected as Company).ceoName} />
                  <Row label="사업자번호" value={(selected as Company).businessNumber} />
                  <Row label="과세유형" value={(selected as Company).taxType} />
                  <Row label="은행" value={(selected as Company).bankName} />
                  <Row label="계좌번호" value={(selected as Company).accountNumber} sensitive />
                  <Row label="담당자 연락처" value={(selected as Company).managerContact} />
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, sensitive }: { label: string; value?: string; sensitive?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`text-sm ${sensitive ? 'font-mono' : ''} text-slate-700`}>{value || '-'}</dd>
    </div>
  );
}

export function BudgetTab({ project, requests, instructors, companies, onAddCost, onDeleteCost }: {
  project: Project;
  requests: PaymentRequest[];
  instructors: Instructor[];
  companies: Company[];
  onAddCost: (input: NewProjectCostInput) => Promise<void>;
  onDeleteCost: (id: string) => Promise<void>;
}) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('강사비');
  const [payeeType, setPayeeType] = useState<'instructor' | 'company' | 'etc'>('instructor');
  const [payeeId, setPayeeId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isCard, setIsCard] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCategory('강사비'); setPayeeType('instructor'); setPayeeId('');
    setPayeeName(''); setAmount(''); setRemarks(''); setIsCard(false); setOpen(false);
  };

  const handleSubmit = async () => {
    const finalPayeeName = payeeType === 'etc' ? payeeName : payeeName;
    if (!finalPayeeName || !amount) return;
    setSaving(true);
    await onAddCost({
      category,
      payeeType,
      payeeId: payeeType !== 'etc' ? payeeId : undefined,
      payeeName: finalPayeeName,
      budgetAmount: Number(amount),
      isCardPayment: isCard,
      remarks: remarks || undefined,
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
          <Field label="이익률"><span className={`font-semibold ${profitTone}`}>{profitRateLabel(project)}</span></Field>
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={payeeType}
                onChange={(e) => { setPayeeType(e.target.value as typeof payeeType); setPayeeId(''); setPayeeName(''); }}
                className={inputCls}
              >
                <option value="instructor">강사</option>
                <option value="company">업체</option>
                <option value="etc">기타(직접입력)</option>
              </select>

              {payeeType === 'etc' ? (
                <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="지급대상명 직접 입력"
                  className={`${inputCls} col-span-2`} />
              ) : (
                <PayeePicker
                  payeeType={payeeType}
                  instructors={instructors}
                  companies={companies}
                  selectedId={payeeId}
                  onSelect={(id, name) => { setPayeeId(id); setPayeeName(name); }}
                  onTypeChange={(t) => { setPayeeType(t); setPayeeId(''); }}
                />
              )}

              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="예산금액"
                className={inputCls} />
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="세부내용(관련 내용 작성)"
                className={`${inputCls} sm:col-span-2`} />
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={isCard} onChange={(e) => setIsCard(e.target.checked)} />
                카드결제(지급요청 제외)
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSubmit} disabled={saving || !payeeName || !amount}
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
              <th className="px-3 py-2.5 font-medium">삭제</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5 text-slate-600">{r.payeeType}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{r.payeeName}</td>
                  <td className="px-3 py-2.5 text-right"><MoneyText value={r.amount} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.status}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => { if (confirm(`'${r.payeeName}' 예산 항목을 삭제할까요?`)) onDeleteCost(r.id); }}
                      className="text-slate-400 hover:text-red-500"
                      title="삭제 (관리자 권한 필요)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
