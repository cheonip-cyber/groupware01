import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { EmptyState } from '../common/EmptyState';
import { formatDate } from '../../utils/formatters';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PiggyBank, RefreshCw } from 'lucide-react';

interface ManualExpense {
  id: number;
  transaction_date: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
}

// 실데이터 기준 확인된 판관비 카테고리 (급여/상여, 세금/공과, 대출/수수료, 렌탈/위탁, 임대료/관리비, 기기구입/기타)
const CATEGORY_COLOR: Record<string, string> = {
  '급여/상여': '#3b82f6',
  '세금/공과': '#f59e0b',
  '대출/수수료': '#ef4444',
  '렌탈/위탁': '#8b5cf6',
  '임대료/관리비': '#10b981',
  '기기구입/기타': '#94a3b8',
};

export function AdminSgaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ManualExpense[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await cardSupabase
      .from('manual_expenses')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (err) setError(err.message);
    else setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const total = byCategory.reduce((s, c) => s + c.value, 0);
  const pendingCount = rows.filter((r) => r.status !== 'paid').length;

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  if (error) return <div className="py-20 text-center text-sm text-red-500">CARD DB 연결 오류: {error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">CARD 프로젝트(별도 Supabase)의 manual_expenses 기준 — 데이터 복사 없음</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> 새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">전체 판관비 합계</p>
          <p className="mt-1 text-xl font-bold text-slate-900"><MoneyText value={total} compact /></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">건수</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{filtered.length}건</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-600">미지급 대기</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{pendingCount}건</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="카테고리별 비중" icon={<PiggyBank className="h-4 w-4 text-slate-400" />} />
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {byCategory.map((d) => <Cell key={d.name} fill={CATEGORY_COLOR[d.name] ?? '#cbd5e1'} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [v.toLocaleString('ko-KR') + '원', '']} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="카테고리별 합계" />
          <div className="divide-y divide-slate-50 p-2">
            {byCategory.map((c) => (
              <div key={c.name} className="flex items-center justify-between px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[c.name] ?? '#cbd5e1' }} />
                  {c.name}
                </span>
                <MoneyText value={c.value} className="text-sm font-medium" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`상세 내역 (${filtered.length}건)`}
          action={
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
              <option value="all">전체</option>
              <option value="pending">대기중</option>
              <option value="paid">지급완료</option>
            </select>
          }
        />
        {filtered.length === 0 ? <EmptyState title="내역이 없습니다" /> : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">일자</th>
                <th className="px-3 py-2.5 font-medium">카테고리</th>
                <th className="px-3 py-2.5 font-medium">내용</th>
                <th className="px-3 py-2.5 text-right font-medium">금액</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 text-xs text-slate-500">{formatDate(r.transaction_date)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.category}</td>
                    <td className="px-3 py-2 text-slate-700">{r.description ?? '-'}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={r.amount} /></td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {r.status === 'paid' ? '지급완료' : '대기'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
