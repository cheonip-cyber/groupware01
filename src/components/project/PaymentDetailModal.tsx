import { useMemo, useState } from 'react';
import type { PaymentRequest, Instructor, Company } from '../../types';
import { useAppData } from '../../store/appData';
import { dataSource } from '../../services/dataSource';
import { MoneyText } from '../common/MoneyText';
import { calcWithholdingFor, maskResidentNumber } from '../../utils/withholding';
import { useEscClose } from '../../hooks/useEscClose';
import { MonthPicker } from '../common/MonthPicker';
import { useToast } from '../common/toast';
import { CheckCircle2, Search, X } from 'lucide-react';

// 지급 상세 정보 (구 그룹웨어 '3. 지급 상세 정보' 이식):
// 최종 지급 전 검토 단계 — 대상 정보 확인·계좌 수정·대상 재검색·세금 방식(3.3/8.8/용역수동) 조정 후 지급요청 확정
export function PaymentDetailModal({ r, onClose, onUpdateRequest }: {
  r: PaymentRequest;
  onClose: () => void;
  onUpdateRequest: (id: string, patch: Partial<PaymentRequest>) => void;
}) {
  useEscClose(true, onClose);
  const { instructors, companies, refresh } = useAppData();
  const isPerson = r.payeeType === '강사';
  const payee: Instructor | Company | undefined = useMemo(() => {
    if (!r.payeeId) return undefined;
    return isPerson ? instructors.find((i) => String(i.id) === String(r.payeeId))
                    : companies.find((c) => String(c.id) === String(r.payeeId));
  }, [r.payeeId, isPerson, instructors, companies]);

  const [taxMode, setTaxMode] = useState(r.taxMode ?? 'rate33');
  const [mIncome, setMIncome] = useState(r.manualIncomeTax ?? 0);
  const [mResident, setMResident] = useState(r.manualResidentTax ?? 0);
  const [schedule, setSchedule] = useState(r.scheduledMonth ?? new Date().toISOString().slice(0, 7));
  const toast = useToast();
  const [justRequested, setJustRequested] = useState(false);
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [editAcct, setEditAcct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(!!r.infoConfirmed);

  const w = calcWithholdingFor({ payeeType: r.payeeType, amount: r.amount, taxMode, manualIncomeTax: mIncome, manualResidentTax: mResident });

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const list: { id: string; label: string; sub: string }[] = [];
    if (isPerson) {
      for (const i of instructors) if (i.name.toLowerCase().includes(q)) list.push({ id: String(i.id), label: i.name, sub: i.specialty ?? '강사' });
    } else {
      for (const c of companies) if (c.companyName.toLowerCase().includes(q) || (c.ceoName ?? '').toLowerCase().includes(q)) list.push({ id: String(c.id), label: c.companyName, sub: c.ceoName ? `대표 ${c.ceoName}` : '업체' });
    }
    return list.slice(0, 6);
  }, [query, isPerson, instructors, companies]);

  const saveDetail = (extra: Partial<PaymentRequest> = {}) => {
    onUpdateRequest(r.id, {
      taxMode, manualIncomeTax: mIncome, manualResidentTax: mResident,
      scheduledMonth: schedule,
      ...extra,
    });
  };

  const saveAccount = async () => {
    if (!r.payeeId) return;
    setBusy(true);
    try {
      if (isPerson) await dataSource.updateInstructor(String(r.payeeId), { bankName: bank, accountNumber: account } as Partial<Instructor>);
      else await dataSource.updateCompany(String(r.payeeId), { bankName: bank, accountNumber: account } as Partial<Company>);
      await refresh();
      setEditAcct(false);
    } finally { setBusy(false); }
  };

  const linked = !!r.payeeId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">지급 상세 정보</h3>
            <p className="mt-0.5 text-xs text-slate-500">[{r.costType ?? r.payeeType}] {r.payeeName}{r.detail ? ` · ${r.detail}` : ''}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {/* 프로젝트 / 비고 (지급 정보 확인 팝업과 통일) */}
        {(r.projectName || r.memo) && (
          <div className="mb-4 space-y-1 text-xs">
            {r.projectName && <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-400">프로젝트</span><span className="text-slate-700">{r.projectName}</span></div>}
            {r.memo && <div className="flex justify-between pb-1"><span className="text-slate-400">비고</span><span className="text-slate-700">{r.memo}</span></div>}
          </div>
        )}

        {/* 매칭 상태 (구: 인사/업체 정보 매칭) */}
        <div className={`mb-4 flex items-start gap-2.5 rounded-xl border p-3 ${linked ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
          {linked ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Search className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
          <div className="text-xs">
            <p className={`font-bold ${linked ? 'text-emerald-700' : 'text-red-600'}`}>
              {linked ? `${isPerson ? '강사' : '업체'} 정보 매칭 완료` : '대상 미연결 — 아래에서 검색해 연결하세요'}
            </p>
            {linked && payee && (
              <div className="mt-1.5 space-y-0.5 text-slate-600">
                {isPerson ? (
                  <>
                    <p>주민등록번호: {maskResidentNumber((payee as Instructor).residentNumber)}</p>
                    <p>주소: {(payee as Instructor).address || '-'}</p>
                  </>
                ) : (
                  <p>대표: {(payee as Company).ceoName || '-'} · 사업자번호: {(payee as Company).businessNumber || '-'}</p>
                )}
                {!editAcct ? (
                  <p>계좌: {payee.bankName ? `${payee.bankName} ${payee.accountNumber ?? ''}` : <span className="text-red-500">미등록</span>}
                    <button onClick={() => { setBank(payee.bankName ?? ''); setAccount(payee.accountNumber ?? ''); setEditAcct(true); }}
                      className="ml-2 text-blue-600 underline">수정</button>
                  </p>
                ) : (
                  <span className="flex items-center gap-1.5 pt-1">
                    <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="은행" className="w-20 rounded border border-slate-200 px-1.5 py-1 outline-none" />
                    <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계좌번호" className="w-36 rounded border border-slate-200 px-1.5 py-1 outline-none" />
                    <button onClick={saveAccount} disabled={busy} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">저장</button>
                    <button onClick={() => setEditAcct(false)} className="text-slate-400">취소</button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 대상 재검색 (구: 기존 인사/업체 정보 검색 → 재연결) */}
        <div className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              placeholder={`${isPerson ? '강사' : '업체'} 재검색 (대상이 잘못된 경우 다시 연결)`}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-400" />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1 space-y-1 rounded-lg border border-blue-100 bg-blue-50/50 p-1.5">
              {searchResults.map((it) => (
                <button key={it.id} onClick={() => { onUpdateRequest(r.id, { payeeId: it.id }); setQuery(''); }}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:border-blue-400">
                  <span>{it.label}</span><span className="text-slate-400">{it.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 세금 계산 (강사만 — 구: 3.3% 기본 / 8.8% 세율 / 용역비 수동·면제) */}
        {isPerson && (
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

        {/* 지급 예정 (예약월 — 말일 일괄 배치) */}
        <div className="mb-4 flex items-center justify-between">
          <label className="text-xs font-bold text-slate-600">지급 예정월 (말일 배치)</label>
          <MonthPicker value={schedule} onChange={setSchedule} />
        </div>

        {r.status !== '지급완료' && (
          <label className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4" />
            지급 정보(계좌·금액)를 확인했습니다
            <span className="text-[11px] text-slate-400">— 확인 후 요청 가능</span>
          </label>
        )}

        <div className="flex gap-2">
          {r.status === '지급요청' && !justRequested && (
            <button onClick={() => { saveDetail({ status: '지급대상', infoConfirmed: false }); onClose(); }}
              className="flex-1 rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100">요청 취소</button>
          )}
          {r.status === '지급완료' ? (
            <button disabled className="flex-[2] cursor-default rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-400">지급완료됨</button>
          ) : (
            <button onClick={() => {
              if (r.status === '지급대상') {
                if (!linked) { alert('지급 대상을 먼저 연결하세요.'); return; }
                if (!confirmed) { alert('지급 정보(계좌·금액) 확인 후 요청할 수 있습니다.'); return; }
              }
              saveDetail({ status: '지급요청', infoConfirmed: true });
              setJustRequested(true);
              toast.success('지급요청 완료');
              setTimeout(onClose, 600);
            }}
              className="flex-[2] rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={justRequested || (r.status === '지급대상' && !confirmed)}>
              {justRequested ? '지급요청 완료' : '지급요청'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
