import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader } from '../common/Card';
import { Mic } from 'lucide-react';

// 강사 섭외 현황 (2026-08-19 신설, 2026-08-21 클릭 이동/교육일정/체크리스트 통합)
// — 노션 "강사섭외" 관계형 필드를 groupware.project_instructors 정션 테이블로 동기화한 결과를
//   groupware.instructor_engagement_status 뷰로 그대로 노출한다.
// — 정산(instructor_payments)이 이미 끝난 강사-프로젝트 조합은 뷰 단계에서 이미 제외되어 있음
//   (지급완료 = instructor_payments 기록 존재 여부 기준, 2026-08-19 확정).
// — 강사 기준 정렬, 한 강사가 여러 프로젝트에 걸려있으면 전부 표시.
// — 강사명 클릭 → 강사관리 화면의 해당 강사 상세 패널 자동 오픈(?highlight=ID).
// — 프로젝트명 클릭 → 프로젝트 상세로 이동.
// — 교육일정(session_1~5_date 중 값이 있는 것만) 있는 경우에만 표시.
// — 업무 체크리스트(강사별 독립)는 원래 별도 카드였으나, 박스를 나눌 필요 없다는 피드백으로
//   각 강사 블록 오른쪽 끝에 인라인으로 통합함(2026-08-21).

interface EngagementRow {
  instructor_id: number;
  instructor_name: string;
  project_id: number;
  project_name: string;
  project_status: string | null;
  revenue_month: string | null;
  session_dates: string[] | null;
}

const STATUS_COLOR: Record<string, string> = {
  '요청/담당': 'bg-gray-100 text-gray-700',
  '제안/PT': 'bg-yellow-100 text-yellow-800',
  '확정/준비': 'bg-blue-100 text-blue-800',
  '준비': 'bg-purple-100 text-purple-800',
  '운영/모니터링': 'bg-pink-100 text-pink-800',
  '보고/정산': 'bg-green-100 text-green-800',
  '종료(수익화 완료)': 'bg-emerald-100 text-emerald-800',
  '취소/보류': 'bg-slate-200 text-slate-500',
};

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'confirm_notice', label: '확정/취소 안내' },
  { key: 'confirm_email', label: '확인메일 발송' },
  { key: 'materials', label: '교재 수령' },
  { key: 'pre_post_call', label: '교육 전후 통화' },
  { key: 'settlement_docs', label: '정산서류/세발' },
];

function formatSessionDates(dates: string[] | null): string | null {
  if (!dates || dates.length === 0) return null;
  return dates.map((d) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  }).join(', ');
}

export function InstructorEngagementStatus() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [checkState, setCheckState] = useState<Record<string, boolean>>({}); // key = `${instructor_id}:${item_key}`
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('instructor_engagement_status')
        .select('*');
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const engagementRows = (data ?? []) as EngagementRow[];
      setRows(engagementRows);

      const instructorIds = [...new Set(engagementRows.map((r) => r.instructor_id))];
      if (instructorIds.length > 0) {
        const { data: stateRows } = await supabase
          .from('ops_checklist_state')
          .select('instructor_id, item_key, checked')
          .in('instructor_id', instructorIds);
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        (stateRows ?? []).forEach((r: any) => { map[`${r.instructor_id}:${r.item_key}`] = r.checked; });
        setCheckState(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleCheck = async (instructorId: number, itemKey: string) => {
    const mapKey = `${instructorId}:${itemKey}`;
    const next = !(checkState[mapKey] ?? false);
    setCheckState((prev) => ({ ...prev, [mapKey]: next }));
    await supabase.from('ops_checklist_state').upsert({
      instructor_id: instructorId,
      item_key: itemKey,
      checked: next,
      checked_at: next ? new Date().toISOString() : null,
      checked_by: next ? (profile?.name || profile?.email || null) : null,
    }, { onConflict: 'instructor_id,item_key' });
  };

  // 강사별 그룹핑 (뷰가 이미 강사명순 정렬되어 있어 순서만 보존)
  const grouped: { instructorId: number; instructorName: string; items: EngagementRow[] }[] = [];
  for (const row of rows) {
    const last = grouped[grouped.length - 1];
    if (last && last.instructorName === row.instructor_name) last.items.push(row);
    else grouped.push({ instructorId: row.instructor_id, instructorName: row.instructor_name, items: [row] });
  }

  return (
    <Card>
      <CardHeader title="강사 섭외 현황" icon={<Mic className="h-4 w-4 text-slate-400" />}
        action={<span className="text-[11px] text-slate-400">지급완료 건 제외 · 강사순</span>} />
      {loading ? (
        <div className="px-5 pb-4 text-sm text-slate-400">불러오는 중...</div>
      ) : error ? (
        <div className="px-5 pb-4 text-sm text-red-500">불러오기 실패: {error}</div>
      ) : grouped.length === 0 ? (
        <div className="px-5 pb-4 text-sm text-slate-400">표시할 항목이 없습니다.</div>
      ) : (
        <div className="space-y-2 px-5 pb-3 pt-1">
          {grouped.map((g) => (
            <div key={g.instructorName} className="flex items-start gap-4 rounded-lg border-l-[3px] border-blue-400 bg-slate-50/80 py-2 pl-3 pr-3">
              {/* 좌: 강사명 + 프로젝트 리스트 */}
              <div className="min-w-0 flex-1">
                <Link to={`/instructors?highlight=${g.instructorId}`}
                  className="text-[15px] font-semibold text-slate-800 hover:text-blue-600 hover:underline mb-1.5 inline-block">
                  {g.instructorName}
                </Link>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const sessionLabel = formatSessionDates(it.session_dates);
                    return (
                      <div key={it.project_id} className="flex items-center gap-2 text-sm">
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            STATUS_COLOR[it.project_status ?? ''] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {it.project_status ?? '-'}
                        </span>
                        <Link to={`/projects/${it.project_id}`} className="text-slate-600 hover:text-blue-600 hover:underline truncate">
                          {it.project_name}
                        </Link>
                        {sessionLabel && (
                          <span className="shrink-0 text-[11px] text-slate-400">{sessionLabel}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 우: 강사별 업무 체크리스트 */}
              <div className="shrink-0 border-l border-slate-200 pl-4">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {CHECKLIST_ITEMS.map((item) => {
                    const checked = checkState[`${g.instructorId}:${item.key}`] ?? false;
                    return (
                      <label key={item.key} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px]">
                        <input type="checkbox" checked={checked} onChange={() => toggleCheck(g.instructorId, item.key)}
                          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-600" />
                        <span className={checked ? 'text-slate-400 line-through' : 'text-slate-600'}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
