import { useMemo, useState } from 'react';
import type { PaymentRequest, Instructor, Company } from '../../types';
import { useAppData } from '../../store/appData';
import { dataSource } from '../../services/dataSource';
import { MoneyText } from '../common/MoneyText';
import { calcWithholdingFor, maskResidentNumber } from '../../utils/withholding';
import { calcVat, defaultVatMode, VAT_MODE_LABEL, type VatMode } from '../../utils/vat';
import { useEscClose } from '../../hooks/useEscClose';
import { MonthPicker } from '../common/MonthPicker';
import { useToast } from '../common/toast';
import { Search, X } from 'lucide-react';

// 지급 정보 확인 (지급관리·프로젝트 지급 탭 공용 팝업)
export function PaymentDetailModal({ r, onClose, onUpdateRequest }: {
  r: PaymentRequest;
  onClose: () => void;
  onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void;
}) {
  useEscClose(true, onClose);
  const { instructors, companies, refresh } = useAppData();
  const toast = useToast();
  const isPerson = r.payeeType === '강사';
  const isVendor = r.payeeType === '업체';

  // 지급처 확정: payee_id는 instructors/companies 각각의 PK라 값이 겹친다(예: 74 = 강사 여지은 & 업체 와이드비스).
  // 따라서 반드시 유형과 함께 봐야 한다. 유형이 '기타'(미지정)인 과거 이관 건은 id만으로 확정할 수 없으므로
  // 저장된 이름과 일치하는 쪽만 채택하고, 확정되지 않으면 아무것도 표시하지 않는다
  // (예전에는 무조건 업체 테이블을 조회해 전혀 다른 업체의 계좌가 표시됐음 — 98건 해당).
  const resolved: { entity: Instructor | Company; kind: 'instructor' | 'company' } | undefined = useMemo(() => {
    if (!r.payeeId) return undefined;
    const inst = instructors.find((i) => String(i.id) === String(r.payeeId));
    const comp = companies.find((c) => String(c.id) === String(r.payeeId));
    if (isPerson) return inst ? { entity: inst, kind: 'instructor' } : undefined;
    if (isVendor) return comp ? { entity: comp, kind: 'company' } : undefined;
    if (comp && comp.companyName === r.payeeName) return { entity: comp, kind: 'company' };
    if (inst && inst.name === r.payeeName) return { entity: inst, kind: 'instructor' };
    return undefined;
  }, [r.payeeId, r.payeeName, isPerson, isVendor, instructors, companies]);

  const currentPayee = resolved?.entity;
  const resolvedIsPerson = resolved?.kind === 'instructor';

  const [taxMode, setTaxMode] = useState(r.taxMode ?? 'rate33');
  const [mIncome, setMIncome] = useState(r.manualIncomeTax ?? 0);
  const [mResident, setMResident] = useState(r.manualResidentTax ?? 0);
  // 지급 예정월 초기값: 지급완료 건은 실제 지급된 월, 미지급 건은 예약월 > 지급요청 생성월 > 현재월 순
  const [schedule, setSchedule] = useState(
    r.status === '지급완료'
      ? (r.paidMonth ?? r.scheduledMonth ?? new Date().toISOString().slice(0, 7))
      : (r.scheduledMonth ?? r.createdMonth ?? new Date().toISOString().slice(0, 7))
  );
  const [confirmed, setConfirmed] = useState(!!r.infoConfirmed);
  const [query, setQuery] = useState('');
  const [pendingPayee, setPendingPayee] = useState<{ id: string; label: string; sub: string; kind: 'instructor' | 'company' } | null>(null);
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [editAcct, setEditAcct] = useState(false);
  const [busy, setBusy] = useState(false);
  // 업체 지급건의 부가세 구분 — 미확인이면 업체 과세유형(과세/면세)으로 기본값 추천.
  // 예산/비용에는 공급가액을 입력하는 관행이라, 확정하지 않으면 부가세만큼 적게 이체된다.
  const [vatMode, setVatMode] = useState<VatMode>(
    (r.vatMode as VatMode | null) ?? defaultVatMode(r.payeeTaxType),
  );
  const [justRequested, setJustRequested] = useState(false);

  const w = calcWithholdingFor({ payeeType: r.payeeType, amount: r.amount, taxMode, manualIncomeTax: mIncome, manualResidentTax: mResident });

  // 검색: 강사·업체를 유형 구분 없이 통합 검색 (업체 대표자명 포함) — 다른 유형 결과를 선택하면 지급유형도 함께 전환
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const instr = instructors
      .filter((i) => i.name.toLowerCase().includes(q))
      .map((i) => ({ kind: 'instructor' as const, id: String(i.id), label: i.name, sub: i.specialty ?? '강사' }));
    const comp = companies
      .filter((c) => c.companyName.toLowerCase().includes(q) || (c.ceoName ?? '').toLowerCase().includes(q))
      .map((c) => ({ kind: 'company' as const, id: String(c.id), label: c.companyName, sub: c.ceoName ? `대표 ${c.ceoName}` : '업체' }));
    const ordered = isPerson ? [...instr, ...comp] : [...comp, ...instr];
    return ordered.slice(0, 8);
  }, [query, isPerson, instructors, companies]);

  // 재검색으로 다른 유형을 선택한 경우, 화면 표시도 그 유형 기준으로 전환
  const effectiveIsPerson = pendingPayee ? pendingPayee.kind === 'instructor' : resolvedIsPerson;

  // 실제 화면에 표시할 지급처 정보: 재검색으로 임시 선택한 대상이 있으면 그걸 우선 표시(저장 전 미리보기)
  const displayPayee = pendingPayee ?? (currentPayee ? { id: r.payeeId!, label: resolvedIsPerson ? (currentPayee as Instructor).name : (currentPayee as Company).companyName, sub: '' } : null);
  const linked = !!displayPayee;

  const buildPatch = (extra: Partial<PaymentRequest> = {}): Partial<PaymentRequest> => ({
    ...(pendingPayee ? { payeeId: pendingPayee.id, payeeName: pendingPayee.label, payeeType: pendingPayee.kind === 'instructor' ? '강사' : '업체' } : {}),
    taxMode, manualIncomeTax: mIncome, manualResidentTax: mResident,
    scheduledMonth: schedule,
    // 업체 부가세 구분 — '저장'으로도 확정 가능해야 한다.
    // (이미 지급요청된 건은 요청 버튼이 없어 저장 외에 확정 경로가 없음)
    ...(isVendor ? { vatMode } : {}),
    ...extra,
  });

  const handleSave = () => {
    // 지급완료 건은 이미 이체가 끝난 상태 — 금액·상태·예정월은 손대지 않고
    // 잘못 연결된 지급처와 부가세 구분만 정정할 수 있게 한다(분류 오류·계좌없음 수정용).
    if (r.status === '지급완료') {
      const patch: Partial<PaymentRequest> = {
        ...(pendingPayee ? {
          payeeId: pendingPayee.id, payeeName: pendingPayee.label,
          payeeType: pendingPayee.kind === 'instructor' ? '강사' : '업체',
        } : {}),
        ...(isVendor ? { vatMode } : {}),
      };
      if (Object.keys(patch).length === 0) { toast.error('변경할 내용이 없습니다'); return; }
      onUpdateRequest(r.id, patch);
      toast.success('지급처 정보가 수정되었습니다');
      setPendingPayee(null);
      return;
    }
    onUpdateRequest(r.id, buildPatch());
    toast.success('저장되었습니다');
    setPendingPayee(null);
  };

  const handleRequest = () => {
    if (r.status === '지급대상') {
      if (!linked) { alert('지급 대상을 먼저 연결하세요.'); return; }
      if (!confirmed) { alert('지급 정보(계좌·금액) 확인 후 요청할 수 있습니다.'); return; }
    }
    const vb = isVendor ? calcVat(r.amount, vatMode) : null;
    if (vb && !confirm(
      `지급요청 금액을 확인해 주세요.\n\n` +
      `구분: ${VAT_MODE_LABEL[vatMode]}\n` +
      `공급가액: ${vb.supply.toLocaleString()}원\n` +
      `부가세: ${vb.vat.toLocaleString()}원\n` +
      `─────────────\n` +
      `실제 이체액: ${vb.total.toLocaleString()}원\n\n이대로 요청할까요?`)) return;
    onUpdateRequest(r.id, buildPatch({ status: '지급요청', infoConfirmed: true }));
    setJustRequested(true);
    toast.success('지급요청 완료');
    setTimeout(onClose, 600);
  };

  const handleCancelRequest = () => {
    onUpdateRequest(r.id, buildPatch({ status: '지급대상', infoConfirmed: false }));
    toast.success('지급요청이 취소되었습니다');
    onClose();
  };

  const saveAccount = async () => {
    if (!r.payeeId) return;
    setBusy(true);
    try {
      if (resolvedIsPerson) await dataSource.updateInstructor(String(r.payeeId), { bankName: bank, accountNumber: account } as Partial<Instructor>);
      else await dataSource.updateCompany(String(r.payeeId), { bankName: bank, accountNumber: account } as Partial<Company>);
      await refresh();
      setEditAcct(false);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="modal-pop relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-5 shadow-pop">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">지급 정보 확인</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {/* 기본 정보 (요청 디자인: 단순 항목 나열) */}
        <div className="mb-4 space-y-2 text-sm">
          <Row label="지급처">
            {displayPayee ? <>{displayPayee.label} <span className="text-xs text-slate-400">({r.payeeType})</span></> : <span className="text-amber-600">대상 미연결</span>}
          </Row>
          {r.projectName && <Row label="프로젝트">{r.projectName}</Row>}
          <Row label="은행 / 계좌">
            {!editAcct ? (
              currentPayee?.bankName
                ? <>{currentPayee.bankName} | {currentPayee.accountNumber}
                    <button onClick={() => { setBank(currentPayee.bankName ?? ''); setAccount(currentPayee.accountNumber ?? ''); setEditAcct(true); }}
                      className="ml-2 text-xs text-blue-600 underline">수정</button>
                  </>
                : linked
                  ? <span className="inline-flex items-center gap-1.5">
                      <span className="text-red-500">미등록</span>
                      <button onClick={() => { setBank(''); setAccount(''); setEditAcct(true); }}
                        className="text-xs text-blue-600 underline">등록</button>
                    </span>
                  : <span className="text-slate-400">-</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="은행" className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none" />
                <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계좌번호" className="w-36 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none" />
                <button onClick={saveAccount} disabled={busy} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">저장</button>
                <button onClick={() => setEditAcct(false)} className="text-xs text-slate-400">취소</button>
              </span>
            )}
          </Row>
          {effectiveIsPerson && <Row label="주민등록번호"><span className="font-mono">{maskResidentNumber((currentPayee as Instructor)?.residentNumber)}</span></Row>}
          {!effectiveIsPerson && isVendor && currentPayee && <Row label="사업자번호">{(currentPayee as Company).businessNumber || '-'}</Row>}
          {r.memo && <Row label="비고">{r.memo}</Row>}
        </div>

        {/* 대상 재검색 (강사/업체/업체 대표자명 통합 검색) — 선택 후 하단 저장 버튼으로 반영.
            유형이 '기타'(대상 미연결)인 건이야말로 연결이 가장 필요하므로 항상 노출한다. */}
        {(
          <div className="mb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
                placeholder="강사·업체·대표자명 통합 검색 (대상이 잘못된 경우 다시 연결)"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-400" />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 space-y-1 rounded-lg border border-blue-100 bg-blue-50/50 p-1.5">
                {searchResults.map((it) => (
                  <button key={`${it.kind}-${it.id}`} onClick={() => { setPendingPayee(it); setQuery(''); }}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:border-blue-400">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${it.kind === 'instructor' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                      {it.kind === 'instructor' ? '강사' : '업체'}
                    </span>
                    <span className="flex-1 truncate">{it.label}</span><span className="text-slate-400">{it.sub}</span>
                  </button>
                ))}
              </div>
            )}
            {pendingPayee && (
              <div className="mt-1.5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs">
                <span><span className="font-semibold text-emerald-700">{pendingPayee.label}</span> <span className="text-emerald-600">({pendingPayee.kind === 'instructor' ? '강사' : '업체'} · {pendingPayee.sub})</span> 선택됨 — 저장을 눌러 반영</span>
                <button onClick={() => setPendingPayee(null)} className="text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        )}

        {/* 세금 계산 (강사만) */}
        {effectiveIsPerson && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-blue-900">세금 계산</p>
              <span className="flex overflow-hidden rounded-lg border border-blue-200 bg-white text-[11px] font-semibold">
                {[['rate33', '3.3%'], ['rate88', '8.8%'], ['manual', '용역비(수동)']].map(([k, label]) => (
                  <button key={k} onClick={() => setTaxMode(k)}
                    className={`px-2.5 py-1 ${taxMode === k ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-blue-50'}`}>{label}</button>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-slate-500">지급총액 (세전)</p><p className="font-bold"><MoneyText value={r.amount} /></p></div>
              <div><p className="text-slate-500">실지급액</p><p className="font-bold text-blue-700"><MoneyText value={w.netAmount} /></p></div>
              <div>
                <p className="text-slate-500">소득세 {taxMode === 'manual' ? '(수동)' : taxMode === 'rate88' ? '(8%)' : '(3%)'}</p>
                {taxMode === 'manual'
                  ? <input type="number" value={mIncome} onChange={(e) => setMIncome(Number(e.target.value))} className="mt-0.5 w-full rounded border border-blue-200 px-1.5 py-1 outline-none" />
                  : <p className="font-medium"><MoneyText value={w.incomeTax} /></p>}
              </div>
              <div>
                <p className="text-slate-500">지방소득세 {taxMode === 'manual' ? '(수동)' : taxMode === 'rate88' ? '(0.8%)' : '(0.3%)'}</p>
                {taxMode === 'manual'
                  ? <input type="number" value={mResident} onChange={(e) => setMResident(Number(e.target.value))} className="mt-0.5 w-full rounded border border-blue-200 px-1.5 py-1 outline-none" />
                  : <p className="font-medium"><MoneyText value={w.residentTax} /></p>}
              </div>
            </div>
          </div>
        )}

        {/* 부가세 계산 (업체만) — 강사의 '세금 계산' 패널과 대칭 구조 */}
        {isVendor && (() => {
          const vb = calcVat(r.amount, vatMode);
          return (
            <div className={`mb-4 rounded-xl border p-3 ${r.vatMode ? 'border-blue-100 bg-blue-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className={`text-xs font-bold ${r.vatMode ? 'text-blue-900' : 'text-amber-800'}`}>
                  부가세 계산 {!r.vatMode && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px]">미확인 — 확정 후 저장하세요</span>}
                </p>
                <span className="flex overflow-hidden rounded-lg border border-blue-200 bg-white text-[11px] font-semibold">
                  {(['exclusive', 'inclusive', 'exempt'] as VatMode[]).map((m) => (
                    <button key={m} onClick={() => setVatMode(m)}
                      className={`px-2.5 py-1 ${vatMode === m ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-blue-50'}`}>
                      {VAT_MODE_LABEL[m]}
                    </button>
                  ))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-slate-500">공급가액</p><p className="font-bold"><MoneyText value={vb.supply} /></p></div>
                <div><p className="text-slate-500">실지급액 (이체금액)</p><p className="font-bold text-blue-700"><MoneyText value={vb.total} /></p></div>
                <div><p className="text-slate-500">부가세 (10%)</p><p className="font-medium"><MoneyText value={vb.vat} /></p></div>
                <div><p className="text-slate-500">업체 등록 과세유형</p><p className="font-medium">{r.payeeTaxType ?? '-'}</p></div>
              </div>
            </div>
          );
        })()}

        {/* 지급 예정월 */}
        <div className="mb-4 flex items-center justify-between">
          <label className="text-xs font-bold text-slate-600">{r.status === '지급완료' ? '지급월' : '지급 예정월 (말일 배치)'}</label>
          {r.status === '지급완료'
            ? <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">{Number(schedule.slice(5, 7))}월 지급</span>
            : <MonthPicker value={schedule} onChange={setSchedule} />}
        </div>

        {r.status !== '지급완료' && (
          <label className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4" />
            지급 정보(계좌·금액)를 확인했습니다
            <span className="text-[11px] text-slate-400">— 확인 후 요청 가능</span>
          </label>
        )}

        {/* 하단 버튼: 상태 전환(넓게) + 저장(파랗고 좁게) */}
        <div className="flex gap-2">
          {r.status === '지급완료' ? (
            <button disabled className="flex-1 cursor-default rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-400">지급완료됨</button>
          ) : r.status === '지급요청' ? (
            <button onClick={handleCancelRequest} className="flex-1 rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100">지급요청 취소</button>
          ) : (
            <button onClick={handleRequest} disabled={justRequested}
              className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
              {justRequested ? '지급요청 완료' : '지급요청'}
            </button>
          )}
          <button onClick={handleSave} title={r.status === '지급완료' ? '지급처·부가세 구분만 수정됩니다(금액·상태는 변경되지 않음)' : undefined}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
            {r.status === '지급완료' ? '지급처 수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2 last:border-0">
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="text-right text-slate-700">{children}</span>
    </div>
  );
}
