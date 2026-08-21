import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader } from '../common/Card';
import { Mic } from 'lucide-react';

// 강사 섭외 현황 (2026-08-19 신설, 2026-08-21 표 형태로 전면 재구성)
// — 노션 "강사섭외" 관계형 필드를 groupware.project_instructors 정션 테이블로 동기화한 결과를
//   groupware.instructor_engagement_status 뷰로 그대로 노출한다.
// — 정산(instructor_payments)이 이미 끝난 강사-프로젝트 조합은 뷰 단계에서 이미 제외되어 있음
//   (지급완료 = instructor_payments 기록 존재 여부 기준, 2026-08-19 확정).
// — 강사 기준 정렬, 한 강사가 여러 프로젝트에 걸려있으면 전부 표시.
// — 강사명 클릭 → 강사관리 화면의 해당 강사 상세 패널 자동 오픈(?highlight=ID).
// — 프로젝트명 클릭 → 프로젝트 상세로 이동.
// — 교육일정(session_1~5_date 중 값이 있는 것만) 있는 경우에만 표시.
// — 업무 체크리스트: 강사 단위였다가(강사 1명이 프로젝트 여러 건을 동시에 진행 중이면
//   구분이 안 되는 문제로) "프로젝트 × 강사" 단위로 재설계(2026-08-21). 화면은 표 형태로
//   바꿔서 상단에 항목명을 스크롤해도 고정으로 보이게 하고(sticky), 각 행에는 체크박스만
//   두어(라벨 반복 없음) 프로젝트가 많은 강사도 목록이 옆으로/세로로 불어나지 않게 했다.

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
  { key: 'confirm_notice', label: '확정/취소\n안내' },
  { key: 'confirm_email', label: '확인메일\n발송' },
  { key: 'materials', label: '교재\n수령' },
  { key: 'pre_post_call', label: '교육전후\n통화' },
  { key: 'settlement_docs', label: '정산서류\n/세발' },
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
  const [checkState, setCheckState] = useState<Record<string, boolean>>({}); // key = `${project_id}:${instructor_id}:${item_key}`
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

      const projectIds = [...new Set(engagementRows.map((r) => r.project_id))];
      if (projectIds.length > 0) {
        const { data: stateRows } = await supabase
          .from('ops_checklist_state')
          .select('project_id, instructor_id, item_key, checked')
          .in('project_id', projectIds);
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        (stateRows ?? []).forEach((r: any) => { map[`${r.project_id}:${r.instructor_id}:${r.item_key}`] = r.checked; });
        setCheckState(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleCheck = async (projectId: number, instructorId: number, itemKey: string) => {
    const mapKey = `${projectId}:${instructorId}:${itemKey}`;
    const next = !(checkState[mapKey] ?? false);
    setCheckState((prev) => ({ ...prev, [mapKey]: next }));
    await supabase.from('ops_checklist_state').upsert({
      project_id: projectId,
      instructor_id: instructorId,
      item_key: itemKey,
      checked: next,
      checked_at: next ? new Date().toISOString() : null,
      checked_by: next ? (profile?.name || profile?.email || null) : null,
    }, { onConflict: 'project_id,instructor_id,item_key' });
  };

  // 강사별 그룹핑 (뷰가 이미 강사명순 정렬되어 있어 순서만 보존) — rowSpan에 사용
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
        <div className="px-2 pb-2">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="w-24 px-2 py-2 text-left text-xs font-semibold text-slate-500">강사</th>
                <th className="w-20 px-2 py-2 text-left text-xs font-semibold text-slate-500">상태</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">프로젝트</th>
                <th className="w-20 px-2 py-2 text-left text-xs font-semibold text-slate-500">일정</th>
                {CHECKLIST_ITEMS.map((item) => (
                  <th key={item.key} className="w-16 whitespace-pre-line px-1.5 py-2 text-center text-[11px] font-semibold leading-tight text-slate-500">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                g.items.map((it, idx) => {
                  const sessionLabel = formatSessionDates(it.session_dates);
                  return (
                    <tr key={it.project_id} className="border-t border-slate-50 hover:bg-slate-50/60">
                      {idx === 0 && (
                        <td rowSpan={g.items.length} className="w-24 align-top px-2 py-2">
                          <Link to={`/instructors?highlight=${g.instructorId}`}
                            className="font-semibold text-slate-800 hover:text-blue-600 hover:underline">
                            {g.instructorName}
                          </Link>
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[it.project_status ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                          {it.project_status ?? '-'}
                        </span>
                      </td>
                      <td className="max-w-0 px-2 py-2">
                        <Link to={`/projects/${it.project_id}`} className="block truncate text-slate-600 hover:text-blue-600 hover:underline">
                          {it.project_name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[11px] text-slate-400">{sessionLabel ?? ''}</td>
                      {CHECKLIST_ITEMS.map((item) => {
                        const checked = checkState[`${it.project_id}:${g.instructorId}:${item.key}`] ?? false;
                        return (
                          <td key={item.key} className="px-1.5 py-2 text-center">
                            <input type="checkbox" checked={checked}
                              onChange={() => toggleCheck(it.project_id, g.instructorId, item.key)}
                              className="h-3.5 w-3.5 cursor-pointer accent-emerald-600" />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
