import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { EmptyState } from '../common/EmptyState';
import { formatDate } from '../../utils/formatters';
import { CreditCard, Wallet, RefreshCw, AlertTriangle } from 'lucide-react';

interface CardTxn {
  id: string;
  transaction_date: string;
  merchant_name: string;
  amount: number;
  purpose: string | null;
  status: string;
  category_name?: string;
}
interface ManualExpense {
  id: number;
  transaction_date: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  is_periodic: boolean;
}
interface RecurringSetting {
  id: number;
  category: string;
  amount: number;
  payment_day: number;
  description: string | null;
  is_active: boolean;
}

// 프로젝트 원가와 중복 계상될 수 있는 카테고리(이전 실데이터 분석에서 확인됨)
const DUPLICATE_RISK_KEYWORD = '플젝중복';

export function AdminCardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardTxns, setCardTxns] = useState<CardTxn[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [recurring, setRecurring] = useState<RecurringSetting[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txnRes, catRes, meRes, rsRes] = await Promise.all([
        cardSupabase.from('card_transactions').select('*').eq('status', 'active').order('transaction_date', { ascending: false }).limit(200),
        cardSupabase.from('expense_categories').select('*'),
        cardSupabase.from('manual_expenses').select('*').order('transaction_date', { ascending: false }).limit(100),
        cardSupabase.from('recurring_settings').select('*').order('payment_day', { ascending: true }),
      ]);
      if (txnRes.error) throw txnRes.error;
      if (meRes.error) throw meRes.error;
      if (rsRes.error) throw rsRes.error;

      const catMap = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));
      setCardTxns((txnRes.data ?? []).map((t: any) => ({ ...t, category_name: catMap.get(t.category_id) ?? '미분류' })));
      setManualExpenses(meRes.data ?? []);
      setRecurring(rsRes.data ?? []);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => [...new Set(cardTxns.map((t) => t.category_name ?? '미분류'))], [cardTxns]);
  const filteredTxns = useMemo(
    () => (categoryFilter ? cardTxns.filter((t) => t.category_name === categoryFilter) : cardTxns),
    [cardTxns, categoryFilter],
  );
  const duplicateRiskTxns = useMemo(
    () => cardTxns.filter((t) => (t.category_name ?? '').includes(DUPLICATE_RISK_KEYWORD)),
    [cardTxns],
  );
  const totalByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of cardTxns) map.set(t.category_name ?? '미분류', (map.get(t.category_name ?? '미분류') ?? 0) + Number(t.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [cardTxns]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  if (error) return <div className="py-20 text-center text-sm text-red-500">CARD DB 연결 오류: {error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">CARD 프로젝트(별도 Supabase)에 실시간 연결 — 데이터 복사 없음</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> 새로고침
        </button>
      </div>

      {duplicateRiskTxns.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">이중계상 검토 필요 ({duplicateRiskTxns.length}건)</p>
              <p className="mt-0.5 text-xs text-amber-600">
                "플젝중복건" 카테고리 — 프로젝트 원가에도 등록되어 있을 수 있습니다. 판관비 집계 시 중복 제외 여부를 확인하세요.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {totalByCategory.slice(0, 6).map(([cat, total]) => (
          <div key={cat} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{cat}</p>
            <p className="mt-1 text-base font-bold text-slate-800"><MoneyText value={total} compact /></p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`카드 사용내역 (${filteredTxns.length}건)`}
          icon={<CreditCard className="h-4 w-4 text-slate-400" />}
          action={
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
              <option value="">전체 카테고리</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          }
        />
        {filteredTxns.length === 0 ? <EmptyState title="내역이 없습니다" /> : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">일자</th>
                <th className="px-3 py-2.5 font-medium">가맹점</th>
                <th className="px-3 py-2.5 font-medium">카테고리</th>
                <th className="px-3 py-2.5 font-medium">용도</th>
                <th className="px-3 py-2.5 text-right font-medium">금액</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTxns.slice(0, 100).map((t) => (
                  <tr key={t.id} className={t.category_name?.includes(DUPLICATE_RISK_KEYWORD) ? 'bg-amber-50/50' : ''}>
                    <td className="px-5 py-2 text-xs text-slate-500">{formatDate(t.transaction_date)}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{t.merchant_name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{t.category_name}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{t.purpose ?? '-'}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={t.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`현금/수기 지출 (${manualExpenses.length}건)`} icon={<Wallet className="h-4 w-4 text-slate-400" />} />
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">일자</th><th className="px-3 py-2 font-medium">분류</th>
                <th className="px-3 py-2 text-right font-medium">금액</th><th className="px-3 py-2 font-medium">상태</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {manualExpenses.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDate(m.transaction_date)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{m.category}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={m.amount} /></td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${m.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {m.status === 'paid' ? '지급완료' : '대기'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title={`정기지출 설정 (${recurring.length}건)`} icon={<Wallet className="h-4 w-4 text-slate-400" />} />
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">결제일</th><th className="px-3 py-2 font-medium">분류</th>
                <th className="px-3 py-2 font-medium">설명</th><th className="px-3 py-2 text-right font-medium">금액</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {recurring.map((r) => (
                  <tr key={r.id} className={!r.is_active ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 text-xs text-slate-500">매월 {r.payment_day}일</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.category}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{r.description ?? '-'}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={r.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
