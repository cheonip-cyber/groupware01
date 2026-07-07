import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { useToast } from '../common/toast';
import { EmptyState } from '../common/EmptyState';
import { formatDate } from '../../utils/formatters';
import { CreditCard, Wallet, RefreshCw, AlertTriangle, Search } from 'lucide-react';

interface CardTxn {
  id: string;
  transaction_date: string;
  merchant_name: string;
  amount: number;
  purpose: string | null;
  status: string;
  category_name?: string;
  project_linked?: boolean;
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardTxns, setCardTxns] = useState<CardTxn[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [recurring, setRecurring] = useState<RecurringSetting[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(''); // YYYY-MM ('' = 전체)

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
  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cardTxns.filter((t) => {
      if (categoryFilter && t.category_name !== categoryFilter) return false;
      if (month && !(t.transaction_date ?? '').startsWith(month)) return false;
      if (q && !`${t.merchant_name ?? ''} ${t.purpose ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cardTxns, categoryFilter, search, month]);
  const duplicateRiskTxns = useMemo(
    () => cardTxns.filter((t) => (t.category_name ?? '').includes(DUPLICATE_RISK_KEYWORD)),
    [cardTxns],
  );
  // 회사비용 합계: 프로젝트 예산에 반영된 건(project_linked)은 제외해 이중 반영 방지
  const totalByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of cardTxns) {
      if (t.project_linked) continue;
      map.set(t.category_name ?? '미분류', (map.get(t.category_name ?? '미분류') ?? 0) + Number(t.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [cardTxns]);
  const projectLinkedStats = useMemo(() => {
    const rows = cardTxns.filter((t) => t.project_linked);
    return { count: rows.length, total: rows.reduce((s, t) => s + Number(t.amount), 0) };
  }, [cardTxns]);

  const toggleProjectLinked = async (t: any) => {
    const next = !t.project_linked;
    setCardTxns((prev) => prev.map((x) => (x.id === t.id ? { ...x, project_linked: next } : x))); // 낙관적 반영
    const { error: err } = await cardSupabase.from('card_transactions').update({ project_linked: next }).eq('id', t.id);
    if (err) {
      setCardTxns((prev) => prev.map((x) => (x.id === t.id ? { ...x, project_linked: !next } : x))); // 실패 시 원복
      toast.error(`변경 실패: ${err.message}`); return;
    }
    toast.success(next ? '프로젝트 귀속으로 표시 — 회사비용 합계에서 제외됩니다' : '일반 비용으로 변경되었습니다');
  };

  // 카드 거래 인라인 편집 (설계 원칙: 입력 마찰 최소화 — 대시보드에서 바로 수정)
  const [editId, setEditId] = useState<string | number | null>(null);
  const [editTx, setEditTx] = useState({ merchant_name: '', purpose: '', amount: 0, transaction_date: '' });
  const startEditTx = (t: any) => {
    setEditId(t.id);
    setEditTx({ merchant_name: t.merchant_name ?? '', purpose: t.purpose ?? '', amount: Number(t.amount ?? 0), transaction_date: String(t.transaction_date ?? '').slice(0, 10) });
  };
  const saveEditTx = async () => {
    if (editId == null) return;
    const patch = { merchant_name: editTx.merchant_name, purpose: editTx.purpose || null, amount: editTx.amount, transaction_date: editTx.transaction_date };
    const { error: err } = await cardSupabase.from('card_transactions').update(patch).eq('id', editId);
    if (err) { toast.error(`수정 실패: ${err.message}`); return; }
    setCardTxns((prev) => prev.map((x) => (x.id === editId ? ({ ...x, ...patch, purpose: patch.purpose ?? undefined } as CardTxn) : x)));
    toast.success('카드 내역이 수정되었습니다');
    setEditId(null);
  };

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
        {projectLinkedStats.count > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3" title="프로젝트 예산에 반영된 카드 사용분 — 손익 이중 반영 방지를 위해 회사비용 합계에서 제외됨">
            <p className="text-xs text-blue-600">프로젝트 귀속 (합계 제외)</p>
            <p className="mt-1 text-base font-bold text-blue-700"><MoneyText value={projectLinkedStats.total} compact /></p>
            <p className="text-[10px] text-blue-500">{projectLinkedStats.count}건</p>
          </div>
        )}
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
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="가맹점·용도 검색"
                  className="w-40 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-400" />
              </span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none" />
              {month && <button onClick={() => setMonth('')} className="text-[11px] text-slate-400 underline">해제</button>}
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="">전체 카테고리</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </span>
          }
        />
        {filteredTxns.length === 0 ? <EmptyState title="내역이 없습니다" /> : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">No.</th>
                <th className="px-3 py-2.5 font-medium">일자</th>
                <th className="px-3 py-2.5 font-medium">가맹점</th>
                <th className="px-3 py-2.5 font-medium">카테고리</th>
                <th className="px-3 py-2.5 font-medium">용도</th>
                <th className="px-3 py-2.5 text-right font-medium">금액</th>
                <th className="px-3 py-2.5 font-medium">구분</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTxns.slice(0, 100).map((t, idx) => editId === t.id ? (
                  <tr key={t.id} className="bg-blue-50/60">
                    <td className="px-5 py-2 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2"><input type="date" value={editTx.transaction_date} onChange={(e) => setEditTx((s) => ({ ...s, transaction_date: e.target.value }))} className="rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                    <td className="px-3 py-2"><input value={editTx.merchant_name} onChange={(e) => setEditTx((s) => ({ ...s, merchant_name: e.target.value }))} className="w-full rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                    <td className="px-3 py-2 text-xs text-slate-400">{t.category_name}</td>
                    <td className="px-3 py-2"><input value={editTx.purpose} onChange={(e) => setEditTx((s) => ({ ...s, purpose: e.target.value }))} placeholder="용도" className="w-full rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={editTx.amount} onChange={(e) => setEditTx((s) => ({ ...s, amount: Number(e.target.value) }))} className="w-28 rounded border border-blue-200 px-1.5 py-1 text-right text-xs outline-none" /></td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        <button onClick={saveEditTx} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700">저장</button>
                        <button onClick={() => setEditId(null)} className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200">취소</button>
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={`group ${t.project_linked ? 'bg-blue-50/40' : t.category_name?.includes(DUPLICATE_RISK_KEYWORD) ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-5 py-2 text-xs tabular-nums text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(t.transaction_date)}</td>
                    <td className="cursor-pointer px-3 py-2 font-medium text-slate-800 hover:text-blue-600" title="클릭해서 수정" onClick={() => startEditTx(t)}>{t.merchant_name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{t.category_name}</td>
                    <td className="cursor-pointer px-3 py-2 text-xs text-slate-400 hover:text-blue-600" title="클릭해서 수정" onClick={() => startEditTx(t)}>{t.purpose ?? '-'}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={t.amount} /></td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleProjectLinked(t)}
                        title="프로젝트 예산 반영 건은 회사비용 합계에서 제외 (손익 이중 반영 방지)"
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          t.project_linked ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {t.project_linked ? '프로젝트 귀속' : '일반'}
                      </button>
                    </td>
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
