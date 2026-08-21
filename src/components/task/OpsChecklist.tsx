import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader } from '../common/Card';
import { CheckSquare } from 'lucide-react';

// 업무 체크리스트 — 강사별 (2026-08-21 신설, 같은 날 전면 재설계)
// — 최초 설계는 팀 전체가 공유하는 단일 체크박스 세트였는데, 강사마다 진행 상황이 다르므로
//   "강사별로 각자 체크박스가 있어야" 의미가 있다는 피드백으로 강사 단위 상태로 재작성.
// — 강사 섭외 현황(instructor_engagement_status)에 나타나는 강사(=지급완료 안 된 강사)만
//   대상으로 하고, 각 강사마다 5개 항목을 독립적으로 체크한다.
// — 저장은 groupware.ops_checklist_state (instructor_id, item_key) 복합키, 팀 공용(Supabase).

const ITEMS: { key: string; label: string }[] = [
  { key: 'confirm_notice', label: '확정/취소 안내' },
  { key: 'confirm_email', label: '확인메일 발송' },
  { key: 'materials', label: '교재 수령' },
  { key: 'pre_post_call', label: '교육 전후 통화' },
  { key: 'settlement_docs', label: '정산서류/세발' },
];

interface StateRow { instructor_id: number; item_key: string; checked: boolean; checked_by: string | null; }

export function OpsChecklist() {
  const { profile } = useAuth();
  const [instructors, setInstructors] = useState<{ id: number; name: string }[]>([]);
  const [state, setState] = useState<Record<string, StateRow>>({}); // key = `${instructor_id}:${item_key}`
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // 강사 섭외 현황과 동일한 대상(지급완료 안 된 강사)만 노출
    const { data: engagementRows } = await supabase
      .from('instructor_engagement_status')
      .select('instructor_id, instructor_name');
    const uniqueMap = new Map<number, string>();
    (engagementRows ?? []).forEach((r: any) => uniqueMap.set(r.instructor_id, r.instructor_name));
    const list = [...uniqueMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    setInstructors(list);

    if (list.length > 0) {
      const { data: stateRows } = await supabase
        .from('ops_checklist_state')
        .select('instructor_id, item_key, checked, checked_by')
        .in('instructor_id', list.map((i) => i.id));
      const map: Record<string, StateRow> = {};
      (stateRows ?? []).forEach((r: any) => { map[`${r.instructor_id}:${r.item_key}`] = r; });
      setState(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (instructorId: number, itemKey: string) => {
    const mapKey = `${instructorId}:${itemKey}`;
    const current = state[mapKey]?.checked ?? false;
    const next = !current;
    setState((prev) => ({
      ...prev,
      [mapKey]: { instructor_id: instructorId, item_key: itemKey, checked: next, checked_by: next ? (profile?.name || profile?.email || null) : null },
    }));
    await supabase.from('ops_checklist_state').upsert({
      instructor_id: instructorId,
      item_key: itemKey,
      checked: next,
      checked_at: next ? new Date().toISOString() : null,
      checked_by: next ? (profile?.name || profile?.email || null) : null,
    }, { onConflict: 'instructor_id,item_key' });
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader title="업무 체크리스트" icon={<CheckSquare className="h-4 w-4 text-slate-400" />}
        action={<span className="text-[11px] text-slate-400">강사별</span>} />
      {instructors.length === 0 ? (
        <div className="px-5 pb-4 text-sm text-slate-400">대상 강사가 없습니다.</div>
      ) : (
        <div className="divide-y divide-slate-50 px-4 pb-3">
          {instructors.map((ins) => (
            <div key={ins.id} className="py-2.5">
              <div className="mb-1.5 text-sm font-semibold text-slate-800">{ins.name}</div>
              <div className="space-y-1">
                {ITEMS.map((item) => {
                  const row = state[`${ins.id}:${item.key}`];
                  const checked = row?.checked ?? false;
                  return (
                    <label key={item.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={checked} onChange={() => toggle(ins.id, item.key)}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-600" />
                      <span className={checked ? 'text-slate-400 line-through' : 'text-slate-600'}>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
