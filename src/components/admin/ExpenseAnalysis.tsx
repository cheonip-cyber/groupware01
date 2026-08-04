import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { formatCompactKRW } from '../../utils/formatters';

// 지출 분석 — 12개월 추이 (2026-08-04: 이상지출 점검·고정비 예산 대비 실적 섹션 제거.
// 이상지출과 유사한 전월 대비 비교는 판관비 관리 화면에 이미 있어 중복이었고,
// 예산 대비 실적은 고정비 체크리스트로 흡수되어 여기서는 추이 차트만 남긴다.)
//  · 교육(플젝중복건) 카드 지출은 프로젝트 원가에 이미 반영되므로 회사 운영비와 분리해 표시한다.

const EDU_CATEGORY = '교육(플젝중복건만)';

interface Sga { transaction_date: string; category: string | null; amount: number }
interface CardTx { transaction_date: string; amount: number; category_id: number | null }

const ym = (d: string) => (d ?? '').slice(0, 7);
const won = (n: number) => n.toLocaleString('ko-KR');

export function ExpenseAnalysis({ year }: { year: string }) {
  const [sga, setSga] = useState<Sga[]>([]);
  const [cards, setCards] = useState<CardTx[]>([]);
  const [eduId, setEduId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const targetYear = year === '전체' ? String(new Date().getFullYear()) : year;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const from = `${targetYear}-01-01`;
        const to = `${Number(targetYear) + 1}-01-01`;
        const [s, c, cat] = await Promise.all([
          cardSupabase.from('manual_expenses').select('transaction_date, category, amount')
            .gte('transaction_date', from).lt('transaction_date', to),
          cardSupabase.from('card_transactions').select('transaction_date, amount, category_id')
            .eq('status', 'active').gte('transaction_date', from).lt('transaction_date', to),
          cardSupabase.from('expense_categories').select('id, name').eq('name', EDU_CATEGORY).maybeSingle(),
        ]);
        if (!alive) return;
        if (s.error) throw s.error;
        if (c.error) throw c.error;
        setSga((s.data ?? []) as Sga[]);
        setCards((c.data ?? []) as CardTx[]);
        setEduId(cat.data?.id ?? null);
        setErr(null);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [targetYear]);

  /** 12개월 추이 — 판관비 / 카드 일반 / 카드 교육원가 3분할 */
  const trend = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => `${targetYear}-${String(i + 1).padStart(2, '0')}`);
    const now = new Date().toISOString().slice(0, 7);
    return months.map((m) => {
      const sgaSum = sga.filter((r) => ym(r.transaction_date) === m).reduce((t, r) => t + Number(r.amount), 0);
      const cardGen = cards.filter((r) => ym(r.transaction_date) === m && r.category_id !== eduId)
        .reduce((t, r) => t + Number(r.amount), 0);
      const cardEdu = cards.filter((r) => ym(r.transaction_date) === m && r.category_id === eduId)
        .reduce((t, r) => t + Number(r.amount), 0);
      const future = m > now;   // 아직 오지 않은 달은 0이 아니라 빈 값으로 둔다
      return {
        month: `${Number(m.slice(5, 7))}월`,
        판관비: future ? null : sgaSum,
        카드: future ? null : cardGen,
        교육원가: future ? null : cardEdu,
      };
    });
  }, [sga, cards, eduId, targetYear]);

  if (loading) return <Card><div className="py-10 text-center text-sm text-slate-400">지출 분석 불러오는 중…</div></Card>;
  if (err) return <Card><div className="py-6 text-center text-sm text-red-500">지출 분석을 불러오지 못했습니다: {err}</div></Card>;

  return (
    <Card>
      <CardHeader title={`${targetYear}년 월별 지출 추이`} icon={<TrendingUp className="h-4 w-4 text-slate-400" />}
        action={<span className="text-[11px] text-slate-400">교육원가는 프로젝트 예산 반영분(회사 비용과 분리)</span>} />
      <div className="h-56 p-5 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatCompactKRW(v)} tick={{ fontSize: 10 }} width={56} />
            <Tooltip formatter={(v: number, n: string) => [v == null ? '-' : `${won(v)}원`, n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="판관비" stackId="e" fill="#3b82f6" />
            <Bar dataKey="카드" stackId="e" fill="#f59e0b" />
            <Bar dataKey="교육원가" stackId="e" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
