import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { useToast } from '../common/toast';
import { CheckCircle2, Circle, AlertTriangle, ClipboardList } from 'lucide-react';

// 고정비 누락 방지 체크리스트 (2026-07-09 설계) — "사람이 기억"이 아니라 "시스템이 먼저 확인"하는 구조.
// recurring_checklist_items(표준 항목) × 이번 달 manual_expenses 존재 여부를 대조해 미등록 항목을 바로 보여주고,
// 클릭 한 번으로 등록까지 이어지게 한다. 금액은 지난달 값을 기본으로 채워 매달 변동되는 항목(4대보험 등)도 대응한다.

interface ChecklistItem {
  id: number; label: string; category: string; desc_pattern: string; payment_day: number | null;
}
interface ExpenseRow { id: number; transaction_date: string; category: string; description: string; amount: number; }

function monthRange(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  const start = d.toISOString().slice(0, 10);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
  return { start, end, label: `${d.getMonth() + 1}월` };
}

export function FixedCostChecklist() {
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [thisMonth, setThisMonth] = useState<ExpenseRow[]>([]);
  const [lastMonth, setLastMonth] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: '' });
  const [busy, setBusy] = useState(false);

  const cur = monthRange(0);
  const prev = monthRange(-1);

  const load = async () => {
    const [itemsRes, curRes, prevRes] = await Promise.all([
      cardSupabase.from('recurring_checklist_items').select('*').eq('is_active', true).order('sort_order'),
      cardSupabase.from('manual_expenses').select('id, transaction_date, category, description, amount')
        .gte('transaction_date', cur.start).lt('transaction_date', cur.end),
      cardSupabase.from('manual_expenses').select('id, transaction_date, category, description, amount')
        .gte('transaction_date', prev.start).lt('transaction_date', prev.end),
    ]);
    setItems((itemsRes.data ?? []) as ChecklistItem[]);
    setThisMonth((curRes.data ?? []) as ExpenseRow[]);
    setLastMonth((prevRes.data ?? []) as ExpenseRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => items.map((item) => {
    const found = thisMonth.find((r) => r.description.includes(item.desc_pattern));
    const lastFound = lastMonth.filter((r) => r.description.includes(item.desc_pattern));
    const lastAmount = lastFound.length > 0 ? lastFound.reduce((s, r) => s + Number(r.amount), 0) : undefined;
    const today = new Date().getDate();
    const overdue = !found && item.payment_day != null && today > item.payment_day;
    return { item, found, lastAmount, overdue };
  }), [items, thisMonth, lastMonth]);

  const pendingCount = rows.filter((r) => !r.found).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  const startEdit = (row: typeof rows[number]) => {
    setEditingId(row.item.id);
    setForm({ date: new Date().toISOString().slice(0, 10), amount: row.lastAmount ? String(row.lastAmount) : '' });
  };

  const submit = async (item: ChecklistItem) => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('금액을 입력하세요'); return; }
    setBusy(true);
    try {
      const { error } = await cardSupabase.from('manual_expenses').insert({
        transaction_date: form.date, category: item.category,
        amount: Number(form.amount), description: `${item.label}(${cur.label})`,
        status: 'paid',
      });
      if (error) throw error;
      toast.success(`${item.label} 등록 완료`);
      setEditingId(null);
      await load();
    } catch (e: any) { toast.error(`등록 실패: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader
        title={`이달의 고정비 체크리스트 (${cur.label})`}
        icon={<ClipboardList className="h-4 w-4 text-slate-400" />}
        action={
          pendingCount === 0
            ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">전 항목 등록 완료</span>
            : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${overdueCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                미등록 {pendingCount}건{overdueCount > 0 ? ` · 결제일 경과 ${overdueCount}건` : ''}
              </span>
        }
      />
      <ul className="divide-y divide-slate-50 px-2">
        {rows.map(({ item, found, lastAmount, overdue }) => (
          <li key={item.id} className="flex items-center gap-2.5 px-2.5 py-2.5 text-sm">
            {found ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              : overdue ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
            <span className={`w-32 shrink-0 font-medium ${found ? 'text-slate-500' : 'text-slate-800'}`}>{item.label}</span>
            {item.payment_day != null && <span className="w-14 shrink-0 text-[11px] text-slate-400">매월 {item.payment_day}일</span>}

            {found ? (
              <span className="flex-1 text-xs text-slate-400">
                {found.transaction_date} 등록됨 · <MoneyText value={found.amount} className="text-slate-600" />
              </span>
            ) : editingId === item.id ? (
              <span className="flex flex-1 flex-wrap items-center gap-1.5">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400" />
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="금액" className="w-28 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400" />
                <button disabled={busy} onClick={() => submit(item)}
                  className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">등록</button>
                <button onClick={() => setEditingId(null)} className="text-[11px] text-slate-400">취소</button>
              </span>
            ) : (
              <span className="flex flex-1 items-center gap-2">
                {lastAmount != null && <span className="text-[11px] text-slate-400">지난달 <MoneyText value={lastAmount} className="text-slate-400" /></span>}
                <button onClick={() => startEdit({ item, found, lastAmount, overdue })}
                  className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
                  지금 등록
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
