import { useEffect, useMemo, useState } from 'react';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { useToast } from '../common/toast';
import { ClipboardList } from 'lucide-react';

// 고정비 누락 방지 체크리스트 (2026-07-09 설계, 2026-07-09 다중항목/경고단계 개편)
// — "사람이 기억"이 아니라 "시스템이 먼저 확인"하는 구조.
// recurring_checklist_items(표준 항목) × 이번 달 manual_expenses 존재 여부를 대조해 미등록 항목을 바로 보여주고,
// 클릭 한 번으로 등록까지 이어지게 한다. 금액은 지난달 값을 기본으로 채워 매달 변동되는 항목(4대보험 등)도 대응한다.
// desc_pattern은 쉼표로 여러 개 지정 가능 (예: 사업소득세 항목 = "사업소득세,지방세,근로소득세" 3건 합산·완료조건 AND).

interface ChecklistItem {
  id: number; label: string; category: string; desc_pattern: string; payment_day: number | null;
}
interface ExpenseRow { id: number; transaction_date: string; category: string; description: string; amount: number; }

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const next = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: ymd(first), end: ymd(next), label: `${first.getMonth() + 1}월` };
}

// 결제일 경고 3단계: D-1(내일 결제) > 지급일(오늘) > 경고(경과) — 등록 전(미완료)일 때만 표시
type DueStage = null | 'd1' | 'today' | 'overdue';
function dueStage(paymentDay: number | null, todayDate: number): DueStage {
  if (paymentDay == null) return null;
  if (todayDate > paymentDay) return 'overdue';
  if (todayDate === paymentDay) return 'today';
  if (todayDate === paymentDay - 1) return 'd1';
  return null;
}
const STAGE_STYLE: Record<Exclude<DueStage, null>, { label: string; cls: string }> = {
  d1: { label: 'D-1', cls: 'bg-amber-50 text-amber-600' },
  today: { label: '오늘', cls: 'bg-orange-50 text-orange-600' },
  overdue: { label: '경고', cls: 'bg-red-50 text-red-600' },
};

export function FixedCostChecklist() {
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [thisMonth, setThisMonth] = useState<ExpenseRow[]>([]);
  const [lastMonth, setLastMonth] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ date: string; amounts: string[] }>({ date: ymd(new Date()), amounts: [''] });
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

  const today = new Date().getDate();

  const rows = useMemo(() => items.map((item) => {
    const subLabels = item.desc_pattern.split(',').map((s) => s.trim()).filter(Boolean);
    // 하위 패턴별로 이번달/지난달 매칭 항목을 찾는다 (사업소득세류는 3개 전부 있어야 '완료')
    const perSub = subLabels.map((label) => {
      const curMatches = thisMonth.filter((r) => r.description.includes(label));
      const lastMatches = lastMonth.filter((r) => r.description.includes(label));
      return { label, curMatches, lastTotal: lastMatches.reduce((s, r) => s + Number(r.amount), 0) };
    });
    const allFound = perSub.every((s) => s.curMatches.length > 0);
    const someFound = perSub.some((s) => s.curMatches.length > 0);
    const totalAmount = perSub.reduce((s, x) => s + x.curMatches.reduce((a, r) => a + Number(r.amount), 0), 0);
    const lastAmount = perSub.reduce((s, x) => s + x.lastTotal, 0) || undefined;
    const latestDate = perSub.flatMap((x) => x.curMatches).map((r) => r.transaction_date).sort().pop();
    const stage = allFound ? null : dueStage(item.payment_day, today);
    return { item, subLabels, perSub, allFound, someFound, totalAmount, lastAmount, latestDate, stage };
  }), [items, thisMonth, lastMonth, today]);

  const pendingCount = rows.filter((r) => !r.allFound).length;
  const overdueCount = rows.filter((r) => r.stage === 'overdue').length;

  const startEdit = (row: typeof rows[number]) => {
    setEditingId(row.item.id);
    setForm({
      date: ymd(new Date()),
      amounts: row.perSub.map((s) => (s.curMatches.length > 0 ? '' : (s.lastTotal ? String(s.lastTotal) : ''))),
    });
  };

  const submit = async (row: typeof rows[number]) => {
    const toInsert = row.perSub
      .map((s, i) => ({ label: s.label, amount: Number(form.amounts[i]), already: s.curMatches.length > 0 }))
      .filter((x) => !x.already);
    if (toInsert.some((x) => !x.amount || x.amount <= 0)) { toast.error('금액을 모두 입력하세요'); return; }
    if (toInsert.length === 0) { setEditingId(null); return; }
    setBusy(true);
    try {
      const suffix = row.subLabels.length > 1 ? '월분' : '월';
      const rowsToInsert = toInsert.map((x) => ({
        transaction_date: form.date, category: row.item.category,
        amount: x.amount,
        description: row.subLabels.length > 1 ? `${x.label}(${cur.label.replace('월', '')}${suffix})` : `${row.item.label}(${cur.label})`,
        status: 'paid',
      }));
      const { error } = await cardSupabase.from('manual_expenses').insert(rowsToInsert);
      if (error) throw error;
      toast.success(`${row.item.label} 등록 완료`);
      setEditingId(null);
      await load();
    } catch (e: any) { toast.error(`등록 실패: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  };

  const uncheck = async (row: typeof rows[number]) => {
    const ids = row.perSub.flatMap((s) => s.curMatches.map((m) => m.id));
    if (ids.length === 0) return;
    if (!confirm(`'${row.item.label}(${cur.label})' 등록을 취소할까요? (${ids.length}건 삭제)`)) return;
    setBusy(true);
    try {
      const { error } = await cardSupabase.from('manual_expenses').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${row.item.label} 등록이 취소되었습니다`);
      await load();
    } catch (e: any) { toast.error(`취소 실패: ${e?.message ?? e}`); }
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
        {rows.map((row) => {
          const { item, subLabels, allFound, someFound, totalAmount, lastAmount, latestDate, stage } = row;
          const editing = editingId === item.id;
          return (
            <li key={item.id} className="flex items-center gap-2.5 px-2.5 py-2.5 text-sm">
              {/* 경고 셀: 모든 행에 동일한 폭/모양으로 렌더링 — 경고 없는 행은 투명 placeholder로 정렬만 유지 */}
              <span className="w-10 shrink-0 text-center">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${stage ? STAGE_STYLE[stage].cls : 'invisible'}`}>
                  {stage ? STAGE_STYLE[stage].label : '—'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={allFound}
                disabled={busy}
                onChange={() => { if (allFound) uncheck(row); else startEdit(row); }}
                className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
              />
              <span className={`w-32 shrink-0 font-medium ${allFound ? 'text-slate-500' : 'text-slate-800'}`}>{item.label}</span>
              {item.payment_day != null && <span className="w-14 shrink-0 text-[11px] text-slate-400">매월 {item.payment_day}일</span>}

              {allFound ? (
                <span className="flex-1 text-xs text-slate-400">
                  {latestDate} 등록됨 · <MoneyText value={totalAmount} className="text-slate-600" />
                  {subLabels.length > 1 && <span className="ml-1 text-slate-300">({subLabels.join('+')})</span>}
                </span>
              ) : editing ? (
                <span className="flex flex-1 flex-wrap items-center gap-1.5">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400" />
                  {row.perSub.map((s, i) => s.curMatches.length > 0 ? (
                    <span key={s.label} className="rounded bg-emerald-50 px-1.5 py-1 text-[11px] text-emerald-600">{s.label} 등록됨</span>
                  ) : (
                    <input key={s.label} type="number" value={form.amounts[i] ?? ''}
                      onChange={(e) => setForm({ ...form, amounts: form.amounts.map((v, vi) => vi === i ? e.target.value : v) })}
                      placeholder={subLabels.length > 1 ? s.label : '금액'}
                      className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400" />
                  ))}
                  <button disabled={busy} onClick={() => submit(row)}
                    className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">등록</button>
                  <button onClick={() => setEditingId(null)} className="text-[11px] text-slate-400">취소</button>
                </span>
              ) : (
                <span className="flex flex-1 items-center gap-2">
                  {someFound && <span className="text-[11px] text-amber-600">{subLabels.filter((_, i) => row.perSub[i].curMatches.length > 0).join(', ')} 등록됨 · 나머지 미등록</span>}
                  {!someFound && lastAmount != null && <span className="text-[11px] text-slate-400">지난달 합계 <MoneyText value={lastAmount} className="text-slate-400" /></span>}
                  <button onClick={() => startEdit(row)}
                    className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
                    지금 등록
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
