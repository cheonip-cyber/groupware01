import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { useAppData } from '../../store/appData';
import { useToast } from '../common/toast';
import { YearMonthPicker } from '../common/YearMonthPicker';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { EmptyState } from '../common/EmptyState';
import { formatDate } from '../../utils/formatters';
import { downloadSgaSheet, downloadCombinedTransferSheet } from '../../utils/paymentExport';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PiggyBank, RefreshCw, Search, Plus, Pencil, Trash2, Download, X } from 'lucide-react';
import { PageSkeleton } from '../common/Skeleton';
import { SavingLabel } from '../common/SavingLabel';

interface ManualExpense {
  id: number;
  transaction_date: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  is_periodic?: boolean;
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
const CATEGORIES = Object.keys(CATEGORY_COLOR);

interface FormState { id: number | null; transaction_date: string; category: string; amount: string; description: string; status: string; }
const emptyForm = (): FormState => ({
  id: null, transaction_date: new Date().toISOString().slice(0, 10),
  category: CATEGORIES[0], amount: '', description: '', status: 'pending',
});

export function AdminSgaPage() {
  const { paymentRequests } = useAppData();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ManualExpense[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');          // YYYY-MM ('' = 전체)
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (month && !r.transaction_date.startsWith(month)) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (q && !`${r.category} ${r.description ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, statusFilter, search, month, categoryFilter]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const total = byCategory.reduce((s, c) => s + c.value, 0);
  const pendingRows = rows.filter((r) => r.status !== 'paid');

  const save = async () => {
    if (!form || !form.amount || Number.isNaN(Number(form.amount))) return;
    setSaving(true);
    try {
      const payload = {
        transaction_date: form.transaction_date,
        category: form.category,
        amount: Number(form.amount),
        description: form.description || null,
        status: form.status,
      };
      const q = form.id == null
        ? cardSupabase.from('manual_expenses').insert(payload)
        : cardSupabase.from('manual_expenses').update(payload).eq('id', form.id);
      const { error: err } = await q;
      if (err) { toast.error(`저장 실패: ${err.message}`); return; }
      toast.success(form.id == null ? '판관비 항목이 추가되었습니다' : '판관비 항목이 수정되었습니다');
      setForm(null);
      await load();
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ManualExpense) => {
    if (!confirm(`'${r.category} · ${r.description ?? ''}' ${Number(r.amount).toLocaleString('ko-KR')}원 항목을 삭제할까요?`)) return;
    const { error: err } = await cardSupabase.from('manual_expenses').delete().eq('id', r.id);
    if (err) { toast.error(`삭제 실패: ${err.message}`); return; }
    toast.success('삭제되었습니다');
    load();
  };

  const toggleStatus = async (r: ManualExpense) => {
    const next = r.status === 'paid' ? 'pending' : 'paid';
    const prevStatus = r.status;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x))); // 낙관적 반영
    const { error: err } = await cardSupabase.from('manual_expenses').update({ status: next }).eq('id', r.id);
    if (err) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: prevStatus } : x))); // 실패 시 원복
      toast.error(`상태 변경 실패: ${err.message}`);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <div className="py-20 text-center text-sm text-red-500">CARD DB 연결 오류: {error}</div>;

  const dlLabel = month || '전체';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-400">CARD 프로젝트(별도 Supabase)의 manual_expenses 기준 — 관리자 전용, 직원 비노출</p>
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={() => downloadSgaSheet(filtered, dlLabel)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> 판관비 내역
          </button>
          <button
            onClick={() => downloadCombinedTransferSheet(
              paymentRequests.filter((p) => p.status === '지급요청'), pendingRows, dlLabel)}
            title="지급요청(강사/업체) + 미지급 판관비 통합 — 은행 이체 계획용"
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            <Download className="h-3.5 w-3.5" /> 통합 이체 내역
          </button>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> 새로고침
          </button>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">조회 결과 합계</p>
          <p className="mt-1 text-xl font-bold text-slate-900"><MoneyText value={total} compact /></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">건수</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{filtered.length}건</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-600">미지급 대기 (전체)</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{pendingRows.length}건</p>
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
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="내용 검색"
                  className="w-36 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-400" />
              </span>
              <YearMonthPicker value={month} onChange={setMonth}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none" />
              {month && <button onClick={() => setMonth('')} className="text-[11px] text-slate-400 underline">해제</button>}
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="">분류 전체</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none">
                <option value="all">전체</option>
                <option value="pending">대기중</option>
                <option value="paid">지급완료</option>
              </select>
              <button onClick={() => setForm(emptyForm())}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> 항목 추가
              </button>
            </span>
          }
        />
        {filtered.length === 0 ? <EmptyState title="내역이 없습니다" /> : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="w-10 px-3 py-2.5 font-medium">No.</th><th className="px-5 py-2.5 font-medium">일자</th>
                <th className="px-3 py-2.5 font-medium">카테고리</th>
                <th className="px-3 py-2.5 font-medium">내용</th>
                <th className="px-3 py-2.5 text-right font-medium">금액</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">관리</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r, __idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-400">{__idx + 1}</td><td className="px-5 py-2 text-xs text-slate-500">{formatDate(r.transaction_date)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.category}</td>
                    <td className="px-3 py-2 text-slate-700">{r.description ?? '-'}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={r.amount} /></td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleStatus(r)} title="클릭하여 상태 전환"
                        className={`rounded-full px-2 py-0.5 text-[11px] ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
                        {r.status === 'paid' ? '지급완료' : '대기'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        <button onClick={() => setForm({
                          id: r.id, transaction_date: r.transaction_date, category: r.category,
                          amount: String(r.amount), description: r.description ?? '', status: r.status,
                        })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(r)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 입력 / 수정 모달 */}
      {form && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-[2px]" onClick={() => setForm(null)}>
          <div className="modal-pop w-full max-w-sm rounded-card bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{form.id == null ? '판관비 항목 추가' : '판관비 항목 수정'}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">일자</span>
                <input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">카테고리</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">금액 (원)</span>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">내용</span>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="지급 내용" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">상태</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-400">
                  <option value="pending">대기중</option>
                  <option value="paid">지급완료</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setForm(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">취소</button>
                <button onClick={save} disabled={saving || !form.amount}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  <SavingLabel saving={saving} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
