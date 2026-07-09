import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Wallet, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';

// 이번 달 자금 캘린더 (2026-07-09 설계) — "확정 매출/비용 합계"가 아니라 "이번 달에 실제로 오가는 돈"을 본다.
// 업무 규칙(사용자 확정):
//  - 고객사 입금: 교육종료일 + 1개월 (수금예정일이 따로 있으면 그걸 우선)
//  - 강사/업체 지급: 교육일 + 1개월 (지급 예약월이 따로 있으면 그걸 우선)
//  - 카드: 하나카드 5일(전전월20일~전월19일 사용분)/25일(전월10일~당월9일 사용분) 결제,
//          카테고리 '교육(플젝중복건만)'은 프로젝트 예산에 이미 잡히므로 제외
//  - 국민카드는 개별 사용내역이 시스템에 없어 정확한 계산 불가 → "확인 필요"로만 표기

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdFromDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addMonths = (dateStr: string, n: number): string | null => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return ymdFromDate(new Date(y, m - 1 + n, d));
};
const inTargetMonth = (dateStr: string | null, targetY: number, targetM: number) =>
  !!dateStr && dateStr.slice(0, 4) === String(targetY) && Number(dateStr.slice(5, 7)) === targetM + 1;

interface CardTx { transaction_date: string; amount: number; category_id: number; }

export function CashFlowThisMonth() {
  const { projects, paymentRequests, loading } = useAppData();
  const [cardTx, setCardTx] = useState<CardTx[]>([]);
  const [eduCategoryId, setEduCategoryId] = useState<number | null>(null);
  const [extLoading, setExtLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [catRes, txRes] = await Promise.all([
        cardSupabase.from('expense_categories').select('id, name').eq('name', '교육(플젝중복건만)').maybeSingle(),
        cardSupabase.from('card_transactions').select('transaction_date, amount, category_id'),
      ]);
      setEduCategoryId(catRes.data?.id ?? null);
      setCardTx((txRes.data ?? []) as CardTx[]);
      setExtLoading(false);
    })();
  }, []);

  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth(); // 이번 달(0-indexed)
  const monthLabel = `${M + 1}월`;

  const result = useMemo(() => {
    // ── 매출 입금 예정: 교육종료일(없으면 시작일)+1개월, 수금예정일이 있으면 그걸 우선 ──
    const incoming = projects.filter((p) => p.projectStatus !== '취소/보류' && !p.collectionCompleted).map((p) => {
      const estimated = addMonths(p.endDate || p.startDate || '', 1);
      const due = p.collectionDueDate || estimated;
      return { p, due };
    }).filter((x) => inTargetMonth(x.due, Y, M));
    const incomingTotal = incoming.reduce((s, x) => s + (x.p.effectiveAmount ?? x.p.contractAmount ?? 0), 0);

    // ── 강사/업체 지급 예정: 교육일+1개월, 지급예약월이 있으면 그걸 우선 ──
    const outgoingPay = paymentRequests.filter((r) => r.status !== '지급완료').map((r) => {
      const estimated = addMonths(r.projectStartDate || '', 1);
      const due = r.dueDate || estimated;
      return { r, due };
    }).filter((x) => inTargetMonth(x.due, Y, M));
    const outgoingPayTotal = outgoingPay.reduce((s, x) => s + (x.r.amount || 0), 0);

    // ── 카드(하나) 결제 2건: 사용일 기준 구간 합산, 교육중복건 제외 ──
    const sumCardRange = (start: string, end: string) =>
      cardTx.filter((t) => t.transaction_date >= start && t.transaction_date <= end && t.category_id !== eduCategoryId)
        .reduce((s, t) => s + Number(t.amount), 0);

    // 5일 결제(당월5일): 전전월20일 ~ 전월19일
    const d0520start = ymdFromDate(new Date(Y, M - 2, 20));
    const d0520end = ymdFromDate(new Date(Y, M - 1, 19));
    const hana05 = sumCardRange(d0520start, d0520end);

    // 25일 결제(당월25일): 전월10일 ~ 당월9일
    const d25start = ymdFromDate(new Date(Y, M - 1, 10));
    const d25end = ymdFromDate(new Date(Y, M, 9));
    const hana25 = sumCardRange(d25start, d25end);

    return { incoming, incomingTotal, outgoingPay, outgoingPayTotal, hana05, hana25 };
  }, [projects, paymentRequests, cardTx, eduCategoryId, Y, M]);

  if (loading || extLoading) return null;

  const outgoingCardTotal = result.hana05 + result.hana25; // 국민카드는 데이터 없어 합계에서 제외(별도 표기)
  const outgoingTotal = result.outgoingPayTotal + outgoingCardTotal;
  const net = result.incomingTotal - outgoingTotal;

  return (
    <Card>
      <CardHeader title={`이번 달(${monthLabel}) 자금 캘린더`} icon={<Wallet className="h-4 w-4 text-slate-400" />} />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-blue-700"><TrendingUp className="h-3.5 w-3.5" />입금 예정</p>
          <p className="mt-1 text-xl font-bold text-blue-700"><MoneyText value={result.incomingTotal} compact /></p>
          <p className="mt-0.5 text-[11px] text-slate-400">고객사 수금 {result.incoming.length}건 (교육종료+1개월 기준)</p>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-red-700"><TrendingDown className="h-3.5 w-3.5" />출금 예정</p>
          <p className="mt-1 text-xl font-bold text-red-700"><MoneyText value={outgoingTotal} compact /></p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            강사·업체 {result.outgoingPay.length}건 · 하나카드 2회
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600" title="개별 사용내역이 시스템에 없어 국민카드 25일 결제분은 이 합계에 포함되지 않았습니다. 별도로 확인해 주세요.">
              <HelpCircle className="h-3 w-3" />국민카드 미포함
            </span>
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${net >= 0 ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
          <p className={`text-xs font-medium ${net >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>순현금흐름</p>
          <p className={`mt-1 text-xl font-bold ${net >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}><MoneyText value={net} compact /></p>
          <p className="mt-0.5 text-[11px] text-slate-400">입금 예정 − 출금 예정 (판관비 고정비는 위 체크리스트 참고)</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-slate-50 px-4 py-3 text-xs text-slate-500 sm:grid-cols-2">
        <div>하나카드 5일 결제 (5/20~전월19일 사용분): <MoneyText value={result.hana05} className="font-medium text-slate-700" /></div>
        <div>하나카드 25일 결제 (전월10일~당월9일 사용분): <MoneyText value={result.hana25} className="font-medium text-slate-700" /></div>
      </div>
    </Card>
  );
}
