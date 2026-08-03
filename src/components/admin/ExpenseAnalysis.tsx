import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { formatCompactKRW } from '../../utils/formatters';

// 지출 분석 — 12개월 추이 / 이상 지출 / 예산 대비 실적 (2026-08-03)
// 경영 현황은 '보는 곳'이므로 여기서는 조회만 하고 수정하지 않는다.
//
// 판정 기준(협의 확정):
//  · 이상 지출: 전월 대비 ±30%. 단 '세금/공과'는 부가세·법인세 납부 주기에 따라
//    금액이 크게 달라져 경고의 의미가 없으므로 판정에서 제외한다.
//  · 교육(플젝중복건) 카드 지출은 프로젝트 원가에 이미 반영되므로 회사 운영비와 분리해 표시한다.

const EDU_CATEGORY = '교육(플젝중복건만)';
/** 전월 대비 이 비율을 넘게 변동하면 이상 지출로 본다 */
const ALERT_RATE = 0.3;
/** 납부 주기 때문에 월별 편차가 큰 분류 — 이상 지출 판정에서 제외 */
const ALERT_EXCLUDE = ['세금/공과'];

interface Sga { transaction_date: string; category: string | null; amount: number; description: string | null; recurring_id: number | null }
interface CardTx { transaction_date: string; amount: number; category_id: number | null }

const ym = (d: string) => (d ?? '').slice(0, 7);
const won = (n: number) => n.toLocaleString('ko-KR');

export function ExpenseAnalysis({ year }: { year: string }) {
  const [sga, setSga] = useState<Sga[]>([]);
  const [cards, setCards] = useState<CardTx[]>([]);
  const [eduId, setEduId] = useState<number | null>(null);
  const [fixed, setFixed] = useState<{ id: number; label: string; default_amount: number | null }[]>([]);
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
        const [s, c, cat, f] = await Promise.all([
          cardSupabase.from('manual_expenses').select('transaction_date, category, amount, description, recurring_id')
            .gte('transaction_date', from).lt('transaction_date', to),
          cardSupabase.from('card_transactions').select('transaction_date, amount, category_id')
            .eq('status', 'active').gte('transaction_date', from).lt('transaction_date', to),
          cardSupabase.from('expense_categories').select('id, name').eq('name', EDU_CATEGORY).maybeSingle(),
          cardSupabase.from('recurring_checklist_items').select('id, label, default_amount')
            .eq('is_active', true).order('sort_order'),
        ]);
        if (!alive) return;
        if (s.error) throw s.error;
        if (c.error) throw c.error;
        setSga((s.data ?? []) as Sga[]);
        setCards((c.data ?? []) as CardTx[]);
        setEduId(cat.data?.id ?? null);
        setFixed((f.data ?? []) as typeof fixed);
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

  /** 이상 지출 — 최근 실적이 있는 달과 그 전월을 분류별로 비교 */
  const alerts = useMemo(() => {
    const withData = [...new Set(sga.map((r) => ym(r.transaction_date)))].filter(Boolean).sort();
    const cur = withData[withData.length - 1];
    if (!cur) return null;
    const idx = withData.indexOf(cur);
    const prev = idx > 0 ? withData[idx - 1] : null;
    if (!prev) return null;

    const sum = (m: string) => {
      const map = new Map<string, number>();
      for (const r of sga) {
        if (ym(r.transaction_date) !== m) continue;
        const k = r.category || '미분류';
        map.set(k, (map.get(k) ?? 0) + Number(r.amount));
      }
      return map;
    };
    const a = sum(cur), b = sum(prev);
    const items = [...new Set([...a.keys(), ...b.keys()])].map((cat) => {
      const c1 = a.get(cat) ?? 0, c0 = b.get(cat) ?? 0;
      const excluded = ALERT_EXCLUDE.includes(cat);
      const rate = c0 > 0 ? (c1 - c0) / c0 : null;
      return {
        cat, cur: c1, prev: c0, diff: c1 - c0, rate, excluded,
        alert: !excluded && rate !== null && Math.abs(rate) >= ALERT_RATE,
        isNew: c0 === 0 && c1 > 0,
      };
    }).sort((x, y) => y.cur - x.cur);
    return { cur, prev, items, hits: items.filter((i) => i.alert) };
  }, [sga]);

  /** 예산 대비 실적 — 고정비 기준금액과 최근 달 실지출 비교 */
  const budget = useMemo(() => {
    if (!alerts) return null;
    const m = alerts.cur;
    return fixed.map((f) => {
      // 고정비 항목명이 지출 내역(description)에 포함된 건을 실지출로 본다
      // 실지출 판정: recurring_id로 연결된 건 우선, 미연결 건은 내역명에 항목명이 포함된 경우
      const actual = sga.filter((r) => ym(r.transaction_date) === m
        && (r.recurring_id === f.id || (r.recurring_id == null && (r.description ?? '').includes(f.label))))
        .reduce((t, r) => t + Number(r.amount), 0);
      return { ...f, actual, diff: f.default_amount ? actual - f.default_amount : null };
    });
  }, [fixed, sga, alerts]);

  if (loading) return <Card><div className="py-10 text-center text-sm text-slate-400">지출 분석 불러오는 중…</div></Card>;
  if (err) return <Card><div className="py-6 text-center text-sm text-red-500">지출 분석을 불러오지 못했습니다: {err}</div></Card>;

  return (
    <div className="space-y-4">
      {/* 이상 지출 */}
      {alerts && (
        <Card>
          <CardHeader
            title={`이상 지출 점검 (${alerts.prev} → ${alerts.cur})`}
            icon={<AlertTriangle className="h-4 w-4 text-slate-400" />}
            action={<span className="text-[11px] text-slate-400">전월 대비 ±{ALERT_RATE * 100}% 기준</span>}
          />
          <div className="p-5 pt-4">
            {alerts.hits.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                기준을 넘는 변동이 없습니다.
              </p>
            ) : (
              <ul className="mb-3 space-y-1.5">
                {alerts.hits.map((i) => (
                  <li key={i.cat} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <b>{i.cat}</b> <MoneyText value={i.cur} className="text-amber-900" /> —
                    전월 {won(i.prev)}원 대비 <b>{i.diff > 0 ? '+' : '−'}{won(Math.abs(i.diff))}원
                    ({i.rate! > 0 ? '+' : ''}{(i.rate! * 100).toFixed(1)}%)</b>
                  </li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
                  <th className="py-2 pr-2 font-medium">분류</th>
                  <th className="py-2 pr-2 text-right font-medium">{alerts.prev}</th>
                  <th className="py-2 pr-2 text-right font-medium">{alerts.cur}</th>
                  <th className="py-2 pr-2 text-right font-medium">증감</th>
                  <th className="py-2 text-right font-medium">증감률</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {alerts.items.map((i) => (
                    <tr key={i.cat}>
                      <td className="py-2 pr-2 text-slate-700">
                        {i.cat}
                        {i.excluded && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">판정 제외</span>}
                        {i.isNew && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">신규</span>}
                      </td>
                      <td className="py-2 pr-2 text-right text-slate-400">{i.prev > 0 ? won(i.prev) : '-'}</td>
                      <td className="py-2 pr-2 text-right text-slate-700">{i.cur > 0 ? won(i.cur) : '-'}</td>
                      <td className={`py-2 pr-2 text-right font-medium ${i.diff > 0 ? 'text-red-500' : i.diff < 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                        {i.diff === 0 ? '-' : `${i.diff > 0 ? '+' : '−'}${won(Math.abs(i.diff))}`}
                      </td>
                      <td className={`py-2 text-right ${i.alert ? 'font-bold text-amber-600' : 'text-slate-400'}`}>
                        {i.rate === null ? (i.isNew ? '신규' : '-') : `${i.rate > 0 ? '+' : ''}${(i.rate * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* 12개월 추이 */}
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

      {/* 예산 대비 실적 */}
      {budget && budget.length > 0 && (
        <Card>
          <CardHeader title={`고정비 예산 대비 실적 (${alerts?.cur})`} icon={<TrendingUp className="h-4 w-4 text-slate-400" />}
            action={<span className="text-[11px] text-slate-400">기준금액은 고정비 체크리스트에서 수정</span>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">항목</th>
                <th className="px-3 py-2.5 text-right font-medium">기준금액</th>
                <th className="px-3 py-2.5 text-right font-medium">실지출</th>
                <th className="px-3 py-2.5 text-right font-medium">차이</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {budget.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-slate-700">
                      {b.label}
                      {b.default_amount == null && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">기준금액 없음</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{b.default_amount ? won(b.default_amount) : '-'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{b.actual > 0 ? won(b.actual) : '-'}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${b.diff == null ? 'text-slate-300' : b.diff > 0 ? 'text-red-500' : b.diff < 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                      {b.diff == null || b.diff === 0 ? '-' : `${b.diff > 0 ? '+' : '−'}${won(Math.abs(b.diff))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
