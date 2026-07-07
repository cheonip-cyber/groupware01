import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { MoneyText } from '../common/MoneyText';
import { formatDate } from '../../utils/formatters';
import { CreditCard } from 'lucide-react';

// [수정검토실행 ⑲] 카드사용내역 (개인): 로그인 사용자 본인의 카드 사용분만 표시.
// CARD DB app_users.name ↔ 로그인 이메일 아이디(예: jay@… ↔ Jay) 대소문자 무시 매칭.
// 'Team'(공용 아님·관리자 전용)은 개인 화면에서 제외 — 관리자 '카드사용 관리'에서만 조회.
interface Tx { id: number | string; transaction_date: string; merchant_name: string; amount: number; purpose?: string; category_id?: number; category_name?: string }

export function MyCardsPage() {
  const { profile } = useAuth();
  const [txns, setTxns] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const [month, setMonth] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const local = (profile?.email ?? '').split('@')[0].toLowerCase();
        if (!local) { setError('로그인 정보를 확인할 수 없습니다.'); return; }
        const { data: users, error: uErr } = await cardSupabase.from('app_users').select('id, name');
        if (uErr) throw uErr;
        const me = (users ?? []).find((u: any) => String(u.name).toLowerCase() === local && String(u.name).toLowerCase() !== 'team');
        if (!me) { setMatchedName(null); return; }
        setMatchedName(me.name);
        const [txRes, catRes] = await Promise.all([
          cardSupabase.from('card_transactions').select('*').eq('user_id', me.id).eq('status', 'active').order('transaction_date', { ascending: false }).limit(500),
          cardSupabase.from('card_categories').select('id, name'),
        ]);
        if (txRes.error) throw txRes.error;
        const catMap = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));
        setTxns((txRes.data ?? []).map((t: any) => ({ ...t, category_name: catMap.get(t.category_id) ?? '미분류' })));
      } catch (e: any) { setError(e?.message ?? String(e)); }
      finally { setLoading(false); }
    })();
  }, [profile?.email]);

  const filtered = useMemo(() => txns.filter((t) => !month || String(t.transaction_date ?? '').startsWith(month)), [txns, month]);
  const total = useMemo(() => filtered.reduce((s, t) => s + Number(t.amount), 0), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><CreditCard className="h-5 w-5 text-slate-400" /> 카드사용내역 (내 사용분)</h2>
          <p className="mt-0.5 text-xs text-slate-400">본인이 사용한 법인카드 내역만 표시됩니다{matchedName ? ` · 카드 사용자: ${matchedName}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none" />
          {month && <button onClick={() => setMonth('')} className="text-xs text-slate-400 underline">전체</button>}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">카드 데이터 연결 오류: {error}</p>}
      {!loading && !error && matchedName === null && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 계정과 연결된 카드 사용자를 찾지 못했습니다. 관리자에게 카드 시스템 사용자 등록을 요청하세요.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-semibold text-slate-600">{month ? `${month} 사용내역` : '전체 사용내역'} ({filtered.length}건)</span>
          <span className="text-sm font-bold text-slate-800"><MoneyText value={total} /></span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
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
            ) : filtered.slice(0, 200).map((t, i) => (
              <tr key={t.id}>
                <td className="px-5 py-2.5 text-xs tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(t.transaction_date)}</td>
                <td className="px-3 py-2.5 font-medium text-slate-800">{t.merchant_name}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{t.category_name}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{t.purpose ?? '-'}</td>
                <td className="px-3 py-2.5 text-right"><MoneyText value={Number(t.amount)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
