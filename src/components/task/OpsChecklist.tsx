import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader } from '../common/Card';
import { CheckSquare, RotateCcw } from 'lucide-react';
import { useDialog } from '../common/dialog';

// 업무 체크리스트 (2026-08-21 신설)
// — 특정 강사/프로젝트와 연동되지 않는 단순 체크/미체크 위젯. 강사 섭외 진행 중 자주
//   빠뜨리는 항목을 팀 전체가 공유해서 확인하는 용도(요청: "데이터연동까지는 불필요").
// — 팀 공용 상태로 Supabase에 저장(브라우저 로컬 저장은 다른 팀원 화면엔 안 보여 업무 공유 목적에
//   안 맞음). 항목은 재사용 성격이라 "전체 초기화" 버튼으로 다음 배치 때 수동으로 리셋한다.

interface ChecklistRow {
  id: number;
  label: string;
  checked: boolean;
  checked_by: string | null;
}

export function OpsChecklist() {
  const { profile } = useAuth();
  const dialog = useDialog();
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('ops_checklist')
      .select('id, label, checked, checked_by')
      .order('sort_order');
    setRows((data ?? []) as ChecklistRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (row: ChecklistRow) => {
    const nextChecked = !row.checked;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, checked: nextChecked } : r)));
    await supabase.from('ops_checklist').update({
      checked: nextChecked,
      checked_at: nextChecked ? new Date().toISOString() : null,
      checked_by: nextChecked ? (profile?.name || profile?.email || null) : null,
    }).eq('id', row.id);
  };

  const resetAll = async () => {
    if (!await dialog.confirm('체크리스트를 전체 초기화할까요?', { confirmText: '초기화' })) return;
    setRows((prev) => prev.map((r) => ({ ...r, checked: false, checked_by: null })));
    await supabase.from('ops_checklist').update({ checked: false, checked_at: null, checked_by: null }).neq('id', 0);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader title="업무 체크리스트" icon={<CheckSquare className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={resetAll} title="전체 초기화"
            className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        } />
      <ul className="divide-y divide-slate-50 px-2 pb-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
            <input type="checkbox" checked={row.checked} onChange={() => toggle(row)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600" />
            <span className={row.checked ? 'text-slate-400 line-through' : 'text-slate-700'}>{row.label}</span>
            {row.checked && row.checked_by && (
              <span className="ml-auto shrink-0 text-[11px] text-slate-300">{row.checked_by}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
