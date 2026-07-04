import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { paymentStatusStyle } from '../../utils/statusConfig';
import { formatDate, formatCompactKRW } from '../../utils/formatters';
import { calcWithholding, maskResidentNumber } from '../../utils/withholding';
import { downloadTransferSheet, downloadBusinessIncomeSheet } from '../../utils/paymentExport';
import { Search, Download, X, ShieldCheck, Undo2, AlertTriangle } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { PageSkeleton } from '../common/Skeleton';
import type { PaymentRequest } from '../../types';

// 실지급액(이체 기준): 강사(개인)는 3.3% 원천징수 공제 후
const netOf = (r: PaymentRequest) => (r.payeeType === '강사' ? calcWithholding(r.amount).netAmount : r.amount);

export function PaymentsPage() {
  const { paymentRequests, instructors, companies, loading, updatePaymentRequest } = useAppData();
  const { isAdmin } = useAuth();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('전체');            // 대기: 예정일 기준 / 완료: 지급월 기준
  const [month, setMonth] = useState('전체');
  const [subFilter, setSubFilter] = useState<'전체' | '지급대상' | '지급요청'>('전체');
  const [typeFilter, setTypeFilter] = useState<'전체' | '강사' | '업체' | '기타'>('전체');
  const [payMonth, setPayMonth] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMonth, setBulkMonth] = useState(nowMonth);
  const [detail, setDetail] = useState<PaymentRequest | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [dlMonth, setDlMonth] = useState(nowMonth);
  const [busy, setBusy] = useState(false);

  const pendingAll = useMemo(() => paymentRequests.filter((r) => r.status === '지급대상' || r.status === '지급요청'), [paymentRequests]);
  const doneAll = useMemo(() => paymentRequests.filter((r) => r.status === '지급완료'), [paymentRequests]);

  // 탭별 기준일: 대기=지급예정일(dueDate), 완료=지급월(paidMonth)
  const baseOf = (r: PaymentRequest) => (tab === 'pending' ? r.dueDate ?? '' : r.paidMonth ?? '');

  // 완료 탭 진입 시 데이터가 있는 최근 연도 자동 선택 (구 시스템 개선 이력 이식)
  useEffect(() => {
    setSelected(new Set());
    setSubFilter('전체');
    if (tab === 'done') {
      const ys = [...new Set(doneAll.map((r) => (r.paidMonth ?? '').slice(0, 4)).filter(Boolean))].sort().reverse();
      setYear(ys[0] ?? '전체');
      setMonth('전체');
    } else {
      setYear('전체'); setMonth('전체');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const years = useMemo(() => {
    const src = tab === 'pending' ? pendingAll : doneAll;
    return [...new Set(src.map((r) => baseOf(r).slice(0, 4)).filter(Boolean))].sort().reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAll, doneAll, tab]);

  const rows = useMemo(() => {
    const src = tab === 'pending' ? pendingAll : doneAll;
    const q = search.trim().toLowerCase();
    const filtered = src.filter((r) => {
      const base = baseOf(r);
      if (year !== '전체' && !base.startsWith(year)) return false;
      if (month !== '전체' && base.slice(5, 7) !== month) return false;
      if (tab === 'pending' && subFilter !== '전체' && r.status !== subFilter) return false;
      if (typeFilter !== '전체' && r.payeeType !== typeFilter) return false;
      if (q && !`${r.payeeName} ${r.projectName ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // 정렬: 대기=예정일 임박순(없으면 뒤로), 완료=지급월 최신순
    return filtered.sort((a, b) => tab === 'pending'
      ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      : (b.paidMonth ?? '').localeCompare(a.paidMonth ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAll, doneAll, tab, search, year, month, subFilter, typeFilter]);

  // 요약 카운터 (구 시스템 '미요청 N건' 배지 이식)
  const counters = useMemo(() => ({
    unrequested: pendingAll.filter((r) => r.status === '지급대상').length,
    requested: pendingAll.filter((r) => r.status === '지급요청').length,
    doneThisMonth: doneAll.filter((r) => r.paidMonth === nowMonth).length,
  }), [pendingAll, doneAll, nowMonth]);

  // 선택 대상: 대기 탭=지급요청 건(일괄 완료), 완료 탭=전체(일괄 취소)
  const selectableIds = useMemo(
    () => rows.filter((r) => (tab === 'pending' ? r.status === '지급요청' : true)).map((r) => r.id),
    [rows, tab],
  );
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedNetTotal = selectedRows.reduce((s, r) => s + netOf(r), 0);
  // 조회 결과 총액: 현재 탭·필터에 잡힌 건들의 실지급 합 — 지급해야 할 금액 상시 모니터링용
  const visibleNetTotal = rows.reduce((s, r) => s + netOf(r), 0);

  if (loading) return <PageSkeleton rows={8} />;

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected((s) => (s.size >= selectableIds.length ? new Set() : new Set(selectableIds)));

  const runBulk = async (fn: (r: PaymentRequest) => Promise<unknown>, confirmMsg: string) => {
    if (selectedRows.length === 0) return;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try { for (const r of selectedRows) await fn(r); }
    finally { setBusy(false); setSelected(new Set()); }
  };

  const bulkComplete = () => runBulk(
    (r) => updatePaymentRequest(r.id, { status: '지급완료', paidMonth: bulkMonth }),
    `선택한 ${selectedRows.length}건을 지급완료 처리할까요?\n지급월: ${bulkMonth} · 이체 총액 ${selectedNetTotal.toLocaleString('ko-KR')}원`);
  const bulkCancel = () => runBulk(
    (r) => updatePaymentRequest(r.id, { status: '지급요청' }),
    `선택한 ${selectedRows.length}건의 지급을 취소할까요?\n(상태가 '지급요청'으로 되돌아가고 지급월이 해제됩니다)`);

  // 지급요청 생성 게이트: 공통=지급정보 확인, 업체=매입 세금계산서 수취까지 (구 시스템 관행)
  const requestable = (r: PaymentRequest) =>
    !!r.infoConfirmed && (r.payeeType !== '업체' || !!r.vendorTaxInvoiceReceived);
  const gateHint = (r: PaymentRequest) =>
    !r.infoConfirmed ? '상세에서 지급정보 확인 필요'
      : r.payeeType === '업체' && !r.vendorTaxInvoiceReceived ? '상세에서 매입 세금계산서 수취 확인 필요' : '';

  const tabBtn = (t: 'pending' | 'done', label: string, count: number) => (
    <button onClick={() => setTab(t)}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === t ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
      {label} <span className="ml-1 text-xs font-normal opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 요약 카운터 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button onClick={() => { setTab('pending'); setSubFilter('지급대상'); }}
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:border-amber-300">
          <p className="text-xs text-amber-600">미요청 (지급대상)</p>
          <p className="text-xl font-bold text-amber-700">{counters.unrequested}건</p>
        </button>
        <button onClick={() => { setTab('pending'); setSubFilter('지급요청'); }}
          className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-left hover:border-blue-300">
          <p className="text-xs text-blue-600">요청됨 (이체 대기)</p>
          <p className="text-xl font-bold text-blue-700">{counters.requested}건</p>
        </button>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-600">이번 달 지급완료</p>
          <p className="text-xl font-bold text-emerald-700">{counters.doneThisMonth}건</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3" title="현재 탭·필터에 조회된 건들의 실지급액 합계 (강사 3.3% 공제 후)">
          <p className="text-xs text-slate-500">{tab === 'pending' ? '조회 결과 지급 예정액' : '조회 결과 지급액'}</p>
          <p className="text-xl font-bold text-slate-800">{formatCompactKRW(visibleNetTotal)}</p>
          <p className="text-[10px] text-slate-400">{visibleNetTotal.toLocaleString('ko-KR')}원 · {rows.length}건</p>
        </div>
      </div>

      {/* 탭 / 필터 / 다운로드 */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabBtn('pending', '지급 대기', pendingAll.length)}
          {tabBtn('done', '지급 완료', doneAll.length)}
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="지급처·프로젝트 검색"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none">
            <option value="전체">{tab === 'pending' ? '예정 연도 전체' : '지급 연도 전체'}</option>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none">
            <option value="전체">월 전체</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m} value={m}>{Number(m)}월</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none">
            <option value="전체">유형 전체</option><option value="강사">강사</option><option value="업체">업체</option><option value="기타">기타</option>
          </select>
          {tab === 'pending' && (
            <select value={subFilter} onChange={(e) => setSubFilter(e.target.value as typeof subFilter)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none">
              <option value="전체">상태 전체</option><option value="지급대상">미요청</option><option value="지급요청">요청됨</option>
            </select>
          )}
          {isAdmin && (
            <span className="ml-auto flex items-center gap-1.5">
              <input type="month" value={dlMonth} onChange={(e) => setDlMonth(e.target.value)}
                title="다운로드 기준월" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none" />
              <button onClick={() => downloadTransferSheet(paymentRequests.filter((r) => r.status === '지급요청'), dlMonth)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" /> 자금이체양식
              </button>
              <button onClick={() => downloadBusinessIncomeSheet(paymentRequests.filter((r) => r.status === '지급완료' && r.paidMonth === dlMonth), dlMonth)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" /> 사업소득내역
              </button>
            </span>
          )}
        </div>
        {isAdmin && (
          <p className="mt-2 text-[11px] text-slate-400">
            자금이체양식: '지급요청' 상태 전체 · 사업소득내역: 선택월 지급완료 강사 건 (주민번호 포함 — 취급 주의)
          </p>
        )}
      </Card>

      {/* 선택 합계 바 */}
      {selected.size > 0 && (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 ${tab === 'pending' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <span className="text-sm font-medium text-slate-800">
            {selected.size}건 선택 · 이체 총액 <b>{formatCompactKRW(selectedNetTotal)}</b>
            <span className="ml-1 text-xs text-slate-500">({selectedNetTotal.toLocaleString('ko-KR')}원, 실지급 기준)</span>
          </span>
          {tab === 'pending' ? (
            <>
              <input type="month" value={bulkMonth} max={nowMonth} onChange={(e) => setBulkMonth(e.target.value)}
                className="rounded-lg border border-emerald-200 px-2 py-1 text-xs outline-none" />
              <button onClick={bulkComplete} disabled={busy}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">선택 일괄 지급완료</button>
            </>
          ) : (
            <button onClick={bulkCancel} disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              <Undo2 className="h-3.5 w-3.5" /> 선택 일괄 지급취소
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 underline">선택 해제</button>
        </div>
      )}

      {/* 목록 */}
      <Card>
        {rows.length === 0 ? <EmptyState title="해당 지급 건이 없습니다" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="w-8 px-3 py-2.5">
                  {selectableIds.length > 0 && (
                    <input type="checkbox" checked={selected.size > 0 && selected.size >= selectableIds.length} onChange={toggleAll} className="h-4 w-4" title="전체 선택" />
                  )}
                </th>
                <th className="px-3 py-2.5 font-medium">No.</th>
                <th className="px-3 py-2.5 font-medium">지급처</th>
                <th className="px-3 py-2.5 font-medium">유형</th>
                <th className="px-3 py-2.5 font-medium">프로젝트</th>
                <th className="px-3 py-2.5 text-right font-medium">금액(세전)</th>
                <th className="px-3 py-2.5 text-right font-medium">실지급액</th>
                <th className="px-3 py-2.5 font-medium">{tab === 'pending' ? '지급예정일' : '지급월'}</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">처리</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, idx) => {
                  const overdue = tab === 'pending' && !!r.dueDate && r.dueDate < today;
                  const canSelect = tab === 'pending' ? r.status === '지급요청' : true;
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setDetail(r); setLinkQuery(r.payeeName); }}>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {canSelect && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">
                        {r.payeeName}
                        {!r.bankName && <span className="ml-1.5 text-[11px] text-red-500">계좌없음</span>}
                        {r.infoConfirmed && <ShieldCheck className="ml-1.5 inline h-3.5 w-3.5 text-emerald-500" />}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{r.payeeType}</td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/projects/${r.projectId}`} className="text-slate-500 hover:text-blue-600 hover:underline">{r.projectName}</Link>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
                      <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={netOf(r)} /></td>
                      <td className={`px-3 py-3 ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {tab === 'pending'
                          ? <>{formatDate(r.dueDate)}{overdue && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600"><AlertTriangle className="h-3 w-3" />연체</span>}</>
                          : (r.paidMonth ?? '-')}
                      </td>
                      <td className="px-3 py-3">
                        {r.status === '지급완료' && r.paidMonth
                          ? <StatusBadge label={`지급/${Number(r.paidMonth.slice(5, 7))}월`} style={paymentStatusStyle['지급완료']} size="sm" />
                          : <StatusBadge label={r.status} style={paymentStatusStyle[r.status]} size="sm" />}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {r.status === '지급대상' && (
                          <button onClick={() => updatePaymentRequest(r.id, { status: '지급요청' })}
                            disabled={!requestable(r)} title={gateHint(r)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">지급요청 생성</button>
                        )}
                        {r.status === '지급요청' && (
                          <span className="flex items-center gap-1.5">
                            <input type="month" value={payMonth[r.id] ?? nowMonth} max={nowMonth}
                              onChange={(e) => setPayMonth((s) => ({ ...s, [r.id]: e.target.value }))}
                              title="지급월 (소급 처리 시 변경)"
                              className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-blue-400" />
                            <button onClick={() => updatePaymentRequest(r.id, { status: '지급완료', paidMonth: payMonth[r.id] ?? nowMonth })}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">지급완료</button>
                          </span>
                        )}
                        {r.status === '지급완료' && (
                          <button onClick={() => { if (confirm(`'${r.payeeName}' 님의 지급을 취소할까요?\n(상태가 '지급요청'으로 되돌아가고 지급월이 해제됩니다)`)) updatePaymentRequest(r.id, { status: '지급요청' }); }}
                            title="지급 취소 (요청 단계로 되돌리기)"
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-amber-50 hover:text-amber-600">
                            <Undo2 className="h-3.5 w-3.5" /> 취소
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 지급 상세 확인 모달 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">지급 정보 확인</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2.5 text-sm">
              <Row k="지급처">{detail.payeeName} <span className="text-xs text-slate-400">({detail.payeeType})</span></Row>
              <Row k="프로젝트">{detail.projectName ?? '-'}</Row>
              <Row k="은행 / 계좌">
                {detail.bankName ? `${detail.bankName} | ${detail.accountNumber}` :
                  detail.payeeId
                    ? <span className="text-red-500">미등록 — 강사/업체 관리에서 계좌 등록 필요</span>
                    : <span className="text-amber-600">대상 미연결 — 아래에서 연결하세요</span>}
              </Row>
              {!detail.payeeId && (detail.payeeType === '강사' || detail.payeeType === '업체') && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-amber-700">
                    지급처가 {detail.payeeType} DB와 연결되어 있지 않아 계좌를 표시할 수 없습니다. 연결할 대상을 선택하세요.
                  </p>
                  <input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder={`${detail.payeeType}명 검색`}
                    className="mb-1.5 w-full rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs outline-none focus:border-amber-400" />
                  <ul className="max-h-36 divide-y divide-amber-100 overflow-y-auto">
                    {(detail.payeeType === '강사'
                      ? instructors.filter((i) => i.name.toLowerCase().includes(linkQuery.trim().toLowerCase())).slice(0, 8)
                          .map((i) => ({ id: i.id, name: i.name, sub: i.accountInfo ?? '계좌 미등록' }))
                      : companies.filter((c) => `${c.companyName} ${c.ceoName ?? ''}`.toLowerCase().includes(linkQuery.trim().toLowerCase())).slice(0, 8)
                          .map((c) => ({ id: c.id, name: c.ceoName ? `${c.companyName} (대표 ${c.ceoName})` : c.companyName, sub: c.bankName ? `${c.bankName} ${c.accountNumber ?? ''}` : '계좌 미등록' }))
                    ).map((cand) => (
                      <li key={cand.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="font-medium text-slate-700">{cand.name}</span>
                        <span className="text-slate-400">{cand.sub}</span>
                        <button
                          onClick={async () => {
                            await updatePaymentRequest(detail.id, { payeeId: cand.id });
                            setDetail(null);
                          }}
                          className="ml-auto rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600">연결</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.payeeType === '강사' && (
                <>
                  <Row k="주민등록번호"><span className="font-mono">{maskResidentNumber(detail.residentNumber)}</span></Row>
                  <Row k="지급총액(세전)"><MoneyText value={detail.amount} /></Row>
                  {(() => { const w = calcWithholding(detail.amount); return (
                    <>
                      <Row k="소득세 (3%)"><span className="text-red-500">-<MoneyText value={w.incomeTax} /></span></Row>
                      <Row k="지방소득세 (0.3%)"><span className="text-red-500">-<MoneyText value={w.residentTax} /></span></Row>
                      <Row k="실지급액"><span className="font-bold text-emerald-600"><MoneyText value={w.netAmount} /></span></Row>
                    </>
                  ); })()}
                </>
              )}
              {detail.payeeType === '업체' && (
                <>
                  <Row k="지급금액"><MoneyText value={detail.amount} /></Row>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                    <input type="checkbox" checked={!!detail.vendorTaxInvoiceReceived}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await updatePaymentRequest(detail.id, {
                          vendorTaxInvoiceReceived: checked,
                          vendorTaxInvoiceDate: checked ? today : undefined,
                        });
                        setDetail({ ...detail, vendorTaxInvoiceReceived: checked, vendorTaxInvoiceDate: checked ? today : undefined });
                      }} className="h-4 w-4" />
                    매입 세금계산서 수취 확인
                    {detail.vendorTaxInvoiceReceived && detail.vendorTaxInvoiceDate && (
                      <span className="text-xs text-slate-400">({formatDate(detail.vendorTaxInvoiceDate)})</span>
                    )}
                  </label>
                </>
              )}
              {detail.memo && <Row k="비고">{detail.memo}</Row>}
              {detail.status === '지급대상' && (
                <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={!!detail.infoConfirmed}
                    onChange={async (e) => {
                      await updatePaymentRequest(detail.id, { infoConfirmed: e.target.checked });
                      setDetail({ ...detail, infoConfirmed: e.target.checked });
                    }} className="h-4 w-4" />
                  지급 정보(계좌·금액)를 확인했습니다
                  <span className="text-[11px] text-slate-400">{detail.payeeType === '업체' ? '— 계산서 수취와 함께 요청 가능' : '— 확인 후 요청 가능'}</span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2 last:border-0">
      <span className="shrink-0 text-xs font-medium text-slate-400">{k}</span>
      <span className="text-right text-slate-700">{children}</span>
    </div>
  );
}
