import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEscClose } from '../../hooks/useEscClose';
import { Link } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { Card } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { paymentStatusStyle } from '../../utils/statusConfig';
import { formatCompactKRW } from '../../utils/formatters';
import { calcWithholdingFor } from '../../utils/withholding';
import { Search, ShieldCheck, Undo2, AlertTriangle } from 'lucide-react';
import { MonthPicker } from '../common/MonthPicker';
import { downloadTransferSheet, downloadBusinessIncomeSheet } from '../../utils/paymentExport';
import { EmptyState } from '../common/EmptyState';
import { PageSkeleton } from '../common/Skeleton';
import { PaymentDetailModal } from '../project/PaymentDetailModal';
import type { PaymentRequest } from '../../types';

// 실지급액(이체 기준): 강사(개인)는 3.3% 원천징수 공제 후
const netOf = (r: PaymentRequest) => calcWithholdingFor(r).netAmount;

export function PaymentsPage() {
  const { paymentRequests, loading, updatePaymentRequest } = useAppData();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();

  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('전체');            // 대기: 예정일 기준 / 완료: 지급월 기준
  const [month, setMonth] = useState('전체');
  const [typeFilter, setTypeFilter] = useState<'전체' | '강사' | '업체' | '기타'>('전체');
  const [payMonth, setPayMonth] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMonth, setBulkMonth] = useState(nowMonth);
  // 월말 배치 준비용 일괄 예약 지급월 — 반드시 조기 반환(로딩)보다 위에 선언 (React 훅 규칙, 오류 #300 방지)
  const [bulkScheduleMonth, setBulkScheduleMonth] = useState(nextMonth);
  const [detail, setDetail] = useState<PaymentRequest | null>(null);
  useEscClose(!!detail, () => setDetail(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)
  const [busy, setBusy] = useState(false);

  const transferable = useMemo(() => paymentRequests.filter((r) => !r.isCardPayment && r.isPayable !== false), [paymentRequests]);
  // 지급관리에는 '지급요청'된 항목만 표시 — 요청 전 건은 각 프로젝트의 지급 탭에서 검토·요청한다 (혼재로 복잡해 보이던 문제 해소)
  const pendingAll = useMemo(() => transferable.filter((r) => r.status === '지급요청'), [transferable]);
  const doneAll = useMemo(() => transferable.filter((r) => r.status === '지급완료'), [transferable]);

  // 탭별 기준일: 대기=지급예정일(dueDate), 완료=지급월(paidMonth)
  const baseOf = (r: PaymentRequest) => (tab === 'pending' ? r.dueDate ?? '' : r.paidMonth ?? '');

  // 완료 탭 진입 시 데이터가 있는 최근 연도 자동 선택 (구 시스템 개선 이력 이식)
  useEffect(() => {
    setSelected(new Set());
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
    // 카드결제·비지급 항목은 이체 대상이 아니므로 지급관리에서 제외 (구 그룹웨어 규칙)

    const src = tab === 'pending' ? pendingAll : doneAll;
    const q = search.trim().toLowerCase();
    const filtered = src.filter((r) => {
      const base = baseOf(r);
      if (year !== '전체' && !base.startsWith(year)) return false;
      if (month !== '전체' && base.slice(5, 7) !== month) return false;
      if (typeFilter !== '전체' && r.payeeType !== typeFilter) return false;
      if (q && !`${r.payeeName} ${r.projectName ?? ''} ${r.clientName ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // 정렬: 같은 프로젝트끼리 묶이고, 프로젝트 안에서는 강사 → 업체 → 기타, 같은 유형끼리는 이름순
    const typeOrder = (t: string) => (t === '강사' ? 0 : t === '업체' ? 1 : 2);
    return filtered.sort((a, b) =>
      (a.projectName ?? '').localeCompare(b.projectName ?? '', 'ko')
      || typeOrder(a.payeeType) - typeOrder(b.payeeType)
      || a.payeeName.localeCompare(b.payeeName, 'ko'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAll, doneAll, tab, search, year, month, typeFilter]);

  // 요약 카운터 (구 시스템 '미요청 N건' 배지 이식)
  // 카운터는 '전체'가 아니라 현재 연/월 필터 기준 (구 그룹웨어 개발 시 확정된 원칙: 통계 카드는 선택 기간 기준)
  const inPeriod = useCallback((r: PaymentRequest) => {
    const base = r.dueDate || r.scheduledMonth || r.paidMonth || '';
    if (year !== '전체' && !String(base).startsWith(year) && base !== '') return false;
    if (month && !String(base).startsWith(month)) return false;
    return true;
  }, [year, month]);
  const counters = useMemo(() => {
    const pend = pendingAll.filter((r) => !month && year === '전체' ? true : inPeriod(r));
    const dueThis = pendingAll.filter((r) => r.scheduledMonth === nowMonth);
    return {
      unrequested: transferable.filter((r) => r.status === '지급대상').length,
      requested: pend.length,
      doneThisMonth: doneAll.filter((r) => r.paidMonth === nowMonth).length,
      dueThisCount: dueThis.length,
      dueThisTotal: dueThis.reduce((s, r) => s + netOf(r), 0),
    };
  }, [pendingAll, doneAll, nowMonth, inPeriod, month, year]);

  // 선택 대상: 대기 탭=지급요청 건(일괄 완료), 완료 탭=전체(일괄 취소)
  // 대기 탭은 전체 선택 가능 — 일괄 '지급월 예약'은 상태 무관, 일괄 '지급완료'는 지급요청 건만 내부 필터
  const selectableIds = useMemo(() => rows.map((r) => r.id), [rows, tab]);

  // 월별 분리 표시 (구 그룹웨어 UX): 현재월 섹션이 최상단, 이후 미래월(가까운순)→과거월(최근순)→미지정
  const monthGroups = useMemo(() => {
    const keyOf = (r: PaymentRequest) => {
      const base = tab === 'pending' ? (r.scheduledMonth || (r.dueDate ?? '').slice(0, 7)) : (r.paidMonth ?? '');
      return base && base.length >= 7 ? base.slice(0, 7) : '';
    };
    const map = new Map<string, PaymentRequest[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    const keys = [...map.keys()];
    keys.sort((a, b) => {
      if (a === nowMonth) return -1;
      if (b === nowMonth) return 1;
      if (a === '') return 1;
      if (b === '') return -1;
      const aFuture = a > nowMonth, bFuture = b > nowMonth;
      if (aFuture && bFuture) return a.localeCompare(b);      // 미래: 가까운 순
      if (!aFuture && !bFuture) return b.localeCompare(a);    // 과거: 최근 순
      return aFuture ? -1 : 1;                                 // 미래가 과거보다 먼저
    });
    return keys.map((k) => ({ key: k, items: map.get(k)! }));
  }, [rows, tab, nowMonth]);
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

  const bulkComplete = async () => {
    const targets = selectedRows.filter((r) => r.status === '지급요청');
    if (targets.length === 0) { alert('지급완료 처리할 수 있는 건(지급요청 상태)이 선택되지 않았습니다.'); return; }
    if (!confirm(`지급요청 상태 ${targets.length}건을 지급완료 처리할까요?\n지급월: ${bulkMonth}`)) return;
    setBusy(true);
    try { for (const r of targets) await updatePaymentRequest(r.id, { status: '지급완료', paidMonth: bulkMonth }); }
    finally { setBusy(false); setSelected(new Set()); }
  };

  const bulkSchedule = () => runBulk(
    (r) => updatePaymentRequest(r.id, { scheduledMonth: bulkScheduleMonth }),
    `선택한 ${selectedRows.length}건의 지급월을 ${bulkScheduleMonth}(말일 배치)로 예약할까요?`);
  const bulkCancel = () => runBulk(
    (r) => updatePaymentRequest(r.id, { status: '지급요청' }),
    `선택한 ${selectedRows.length}건의 지급을 취소할까요?\n(상태가 '지급요청'으로 되돌아가고 지급월이 해제됩니다)`);

  const tabBtn = (t: 'pending' | 'done', label: string, count: number) => (
    <button onClick={() => setTab(t)}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === t ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
      {label} <span className="ml-1 text-xs font-normal opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 요약 카운터 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" title="요청 전 항목은 각 프로젝트의 지급 탭에서 검토 후 지급요청하세요">
          <p className="text-xs text-amber-600">미요청 (프로젝트에서 요청)</p>
          <p className="text-xl font-bold text-amber-700">{counters.unrequested}건</p>
        </div>
        <button onClick={() => setTab('pending')}
          className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-left hover:border-blue-300">
          <p className="text-xs text-blue-600">요청됨 (이체 대기)</p>
          <p className="text-xl font-bold text-blue-700">{counters.requested}건</p>
        </button>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3" title="이번 달 말일 일괄 지급 배치 대상 (예약월 = 이번 달)">
          <p className="text-xs text-violet-600">이번 달 지급 예정</p>
          <p className="text-xl font-bold text-violet-700">{counters.dueThisCount}건</p>
          <p className="text-[10px] text-violet-500">{formatCompactKRW(counters.dueThisTotal)} (실지급)</p>
        </div>
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {tabBtn('pending', '지급 대기', pendingAll.length)}
            {tabBtn('done', '지급 완료', doneAll.length)}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => {
                const pw = prompt('주민등록번호가 포함된 자료입니다. 다운로드 비밀번호를 입력하세요.');
                if (pw !== '0511') { if (pw !== null) alert('비밀번호가 올바르지 않습니다.'); return; }
                downloadBusinessIncomeSheet(doneAll.filter((r) => r.paidMonth === nowMonth), nowMonth);
              }}
              title="이번 달 지급완료(강사) 사업소득 지급내역 다운로드"
              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700">사업소득</button>
            <button onClick={() => downloadTransferSheet(pendingAll.filter((r) => r.status === '지급요청'), nowMonth)}
              title="지급요청 상태 전체 자금이체 양식 다운로드"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">자금이체</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

        </div>
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
              <span className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/70 px-2 py-1">
                <input type="month" value={bulkScheduleMonth} onChange={(e) => setBulkScheduleMonth(e.target.value)}
                  title="일괄 예약할 지급월 (말일 배치)"
                  className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-xs outline-none" />
                <button onClick={bulkSchedule} disabled={busy}
                  className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">일괄 지급월 예약</button>
              </span>
              <input type="month" value={bulkMonth} max={nowMonth} onChange={(e) => setBulkMonth(e.target.value)}
                className="rounded-lg border border-emerald-200 px-2 py-1 text-xs outline-none" />
              <button onClick={bulkComplete} disabled={busy}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">일괄 지급완료 (요청 건)</button>
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
                <th className="px-2 py-2.5 text-center font-medium" title="프로젝트 고객 입금 여부">입금</th>
                <th className="px-2 py-2.5 text-center font-medium" title="세금계산서 발행 여부">세발</th>
                <th className="px-3 py-2.5 text-right font-medium">금액(세전)</th>
                <th className="px-3 py-2.5 text-right font-medium">세금 내역</th>
                <th className="px-3 py-2.5 text-right font-medium">실지급액</th>
                <th className="px-3 py-2.5 font-medium">{tab === 'pending' ? '지급예정일' : '지급월'}</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">처리</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {monthGroups.map((g) => [
                  <tr key={`h-${g.key}`} className="bg-slate-50/80">
                    <td colSpan={12} className="px-4 py-1.5 text-xs font-bold text-slate-500">
                      {g.key === '' ? '지급월 미지정' : `${g.key.replace('-', '년 ')}월`}{g.key === nowMonth ? ' · 이번 달' : ''}
                      <span className="ml-2 font-normal text-slate-400">{g.items.length}건 · 이체액 {g.items.reduce((t, r) => t + netOf(r), 0).toLocaleString('ko-KR')}원</span>
                    </td>
                  </tr>,
                  ...g.items.map((r, idx) => {
                  const overdue = tab === 'pending' && !!r.dueDate && r.dueDate < today;
                  const canSelect = tab === 'pending' ? r.status === '지급요청' : true;
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(r)}>
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
                      <td className="px-2 py-3 text-center text-xs">{r.projectPaymentReceived ? <span className="font-bold text-emerald-600">✓</span> : <span className="font-bold text-red-400">✗</span>}</td>
                      <td className="px-2 py-3 text-center text-xs">{r.projectTaxInvoiceIssued ? <span className="font-bold text-emerald-600">✓</span> : <span className="font-bold text-red-400">✗</span>}</td>
                      <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={r.amount} /></td>
                      <td className="px-3 py-3 text-right text-xs">
                        {(() => { const w = calcWithholdingFor(r);
                          return w.totalTax > 0
                            ? <span className="text-red-500">-{w.incomeTax.toLocaleString('ko-KR')} / -{w.residentTax.toLocaleString('ko-KR')}</span>
                            : <span className="text-slate-300">-</span>; })()}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800"><MoneyText value={netOf(r)} /></td>
                      <td className={`px-3 py-3 ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {tab === 'pending'
                          ? <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                              <MonthPicker value={r.scheduledMonth ?? nowMonth} onChange={(ym) => updatePaymentRequest(r.id, { scheduledMonth: ym })}
                                className={`rounded border bg-transparent px-1.5 py-0.5 text-xs ${overdue ? 'border-red-200 font-semibold text-red-600' : r.scheduledMonth ? 'border-transparent hover:border-slate-200' : 'border-amber-200 text-amber-600'}`} />
                              {overdue && <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600"><AlertTriangle className="h-3 w-3" />연체</span>}
                            </span>
                          : (r.paidMonth ?? '-')}
                      </td>
                      <td className="px-3 py-3">
                        {r.status === '지급완료' && r.paidMonth
                          ? <StatusBadge label={`지급/${Number(r.paidMonth.slice(5, 7))}월`} style={paymentStatusStyle['지급완료']} size="sm" />
                          : <StatusBadge label={r.status} style={paymentStatusStyle[r.status]} size="sm" />}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {r.status === '지급요청' && (
                          <span className="flex items-center gap-1.5">
                            <MonthPicker value={payMonth[r.id] ?? nowMonth} onChange={(ym) => setPayMonth((s) => ({ ...s, [r.id]: ym }))}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-blue-400" />
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
                }),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 지급 상세 정보 (프로젝트 지급 탭과 동일한 통합 팝업 사용) */}
      {detail && <PaymentDetailModal r={detail} onClose={() => setDetail(null)} onUpdateRequest={updatePaymentRequest} />}
    </div>
  );
}
