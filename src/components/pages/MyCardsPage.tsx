import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { useToast } from '../common/toast';
import { MoneyText } from '../common/MoneyText';
import { YearMonthPicker } from '../common/YearMonthPicker';
import { formatDate } from '../../utils/formatters';
import { CreditCard, Search } from 'lucide-react';

// [수정검토실행 ⑲] 카드사용내역 (개인): 로그인 사용자 본인의 카드 사용분만 표시.
// 관리자 '카드사용 관리'와 동일하게 편집 가능 (본인이 사용한 내역이므로 편집 권한 부여).
// CARD DB app_users.name ↔ 로그인 이메일 아이디 매칭. 'Team'은 개인 화면에서 제외(관리자 전용).
interface Tx { id: number | string; transaction_date: string; merchant_name: string; amount: number; purpose?: string; category_id?: number; category_name?: string }

export function MyCardsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [txns, setTxns] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchedId, setMatchedId] = useState<number | null>(null);
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | number | null>(null);
  const [editTx, setEditTx] = useState({ merchant_name: '', purpose: '', amount: 0, transaction_date: '' });

  const load = async (userId: number) => {
    const [txRes, catRes] = await Promise.all([
      cardSupabase.from('card_transactions').select('*').eq('user_id', userId).eq('status', 'active').order('transaction_date', { ascending: false }).limit(500),
      cardSupabase.from('expense_categories').select('id, name'),
    ]);
    if (txRes.error) throw txRes.error;
    if (catRes.error) throw catRes.error;
    const catMap = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));
    setTxns((txRes.data ?? []).map((t: any) => ({ ...t, category_name: catMap.get(t.category_id) ?? '미분류' })));
  };

  useEffect(() => {
    (async () => {
      try {
        const local = (profile?.email ?? '').split('@')[0].toLowerCase();
        if (!local) { setError('로그인 정보를 확인할 수 없습니다.'); return; }
        const { data: users, error: uErr } = await cardSupabase.from('app_users').select('id, name');
        if (uErr) throw uErr;
        const me = (users ?? []).find((u: any) => String(u.name).toLowerCase() === local && String(u.name).toLowerCase() !== 'team');
        if (!me) { setMatchedId(null); return; }
        setMatchedId(me.id); setMatchedName(me.name);
        await load(me.id);
      } catch (e: any) { setError(e?.message ?? String(e)); }
      finally { setLoading(false); }
    })();
  }, [profile?.email]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter((t) => {
      if (month && !String(t.transaction_date ?? '').startsWith(month)) return false;
      if (q && !`${t.merchant_name ?? ''} ${t.purpose ?? ''} ${t.category_name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txns, month, search]);
  const total = useMemo(() => filtered.reduce((s, t) => s + Number(t.amount), 0), [filtered]);

  const startEdit = (t: Tx) => {
    setEditId(t.id);
    setEditTx({ merchant_name: t.merchant_name ?? '', purpose: t.purpose ?? '', amount: Number(t.amount ?? 0), transaction_date: String(t.transaction_date ?? '').slice(0, 10) });
  };
  const saveEdit = async () => {
    if (editId == null) return;
    const patch = { merchant_name: editTx.merchant_name, purpose: editTx.purpose || null, amount: editTx.amount, transaction_date: editTx.transaction_date };
    const prev = txns;
    setTxns((p) => p.map((x) => (x.id === editId ? { ...x, ...patch, purpose: patch.purpose ?? undefined } as Tx : x))); // 낙관적 반영
    setEditId(null);
    const { error: err } = await cardSupabase.from('card_transactions').update(patch).eq('id', editId);
    if (err) { setTxns(prev); toast.error(`수정 실패: ${err.message}`); return; }
    toast.success('카드 내역이 수정되었습니다');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><CreditCard className="h-5 w-5 text-slate-400" /> 카드사용내역 (내 사용분)</h2>
          <p className="mt-0.5 text-xs text-slate-400">본인이 사용한 법인카드 내역만 표시되며, 가맹점·용도·금액·일자를 직접 수정할 수 있습니다{matchedName ? ` · 카드 사용자: ${matchedName}` : ''}</p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">카드 데이터 연결 오류: {error}</p>}
      {!loading && !error && matchedId === null && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 계정과 연결된 카드 사용자를 찾지 못했습니다. 관리자에게 카드 시스템 사용자 등록을 요청하세요.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <YearMonthPicker value={month} onChange={setMonth}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none" />
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="가맹점·용도·분류 검색" autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </div>
          <span className="ml-auto text-sm font-bold text-slate-800">{filtered.length}건 · <MoneyText value={total} /></span>
        </div>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">No.</th>
            <th className="px-3 py-2.5 font-medium">일자</th>
            <th className="px-3 py-2.5 font-medium">가맹점</th>
            <th className="px-3 py-2.5 font-medium">분류</th>
            <th className="px-3 py-2.5 font-medium">용도</th>
            <th className="px-3 py-2.5 text-right font-medium">금액</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-xs text-slate-400">불러오는 중…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-xs text-slate-400">표시할 사용내역이 없습니다.</td></tr>
            ) : filtered.slice(0, 200).map((t, i) => editId === t.id ? (
              <tr key={t.id} className="bg-blue-50/60">
                <td className="px-5 py-2.5 text-xs text-slate-400">{i + 1}</td>
                <td className="px-3 py-2.5"><input type="date" value={editTx.transaction_date} onChange={(e) => setEditTx((s) => ({ ...s, transaction_date: e.target.value }))} className="rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                <td className="px-3 py-2.5"><input value={editTx.merchant_name} onChange={(e) => setEditTx((s) => ({ ...s, merchant_name: e.target.value }))} className="w-full rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{t.category_name}</td>
                <td className="px-3 py-2.5"><input value={editTx.purpose} onChange={(e) => setEditTx((s) => ({ ...s, purpose: e.target.value }))} placeholder="용도" className="w-full rounded border border-blue-200 px-1.5 py-1 text-xs outline-none" /></td>
                <td className="px-3 py-2.5 text-right">
                  <span className="flex items-center justify-end gap-1">
                    <input type="number" value={editTx.amount} onChange={(e) => setEditTx((s) => ({ ...s, amount: Number(e.target.value) }))} className="w-24 rounded border border-blue-200 px-1.5 py-1 text-right text-xs outline-none" />
                    <button onClick={saveEdit} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700">저장</button>
                    <button onClick={() => setEditId(null)} className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200">취소</button>
                  </span>
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="group">
                <td className="px-5 py-2.5 text-xs tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(t.transaction_date)}</td>
                <td className="cursor-pointer px-3 py-2.5 font-medium text-slate-800 hover:text-blue-600" title="클릭해서 수정" onClick={() => startEdit(t)}>{t.merchant_name}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{t.category_name}</td>
                <td className="cursor-pointer px-3 py-2.5 text-xs text-slate-400 hover:text-blue-600" title="클릭해서 수정" onClick={() => startEdit(t)}>{t.purpose ?? '-'}</td>
                <td className="px-3 py-2.5 text-right"><MoneyText value={Number(t.amount)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
