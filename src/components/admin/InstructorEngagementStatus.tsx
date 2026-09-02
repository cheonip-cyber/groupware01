import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader } from '../common/Card';
import { Mic, MessageSquare, MessageSquareText, Search } from 'lucide-react';

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
// — 메모(2026-08-21 추가): 체크리스트와 동일하게 "프로젝트 × 강사" 단위. 표가 넓어지지
//   않도록 마지막 열에 아이콘만 두고, 클릭하면 그 행 아래에 텍스트 입력 줄이 펼쳐지는 방식.
//   메모가 있으면 아이콘이 채워진 모양으로 바뀌어 한눈에 구분된다.

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
  const [memoState, setMemoState] = useState<Record<string, string>>({}); // key = `${project_id}:${instructor_id}`
  const [openMemoKey, setOpenMemoKey] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 2026-09-01 신설: 강사/프로젝트 검색 + 상태 태그별 보기 토글.
  // 상태 필터는 "기본 전체 활성화(전부 표시), 클릭하면 그 상태만 숨김" 방식 —
  // hiddenStatuses에 담긴 상태만 목록에서 제외한다(빈 Set이면 전체 표시).
  const [search, setSearch] = useState('');
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());

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
        const [{ data: stateRows }, { data: memoRows }] = await Promise.all([
          supabase.from('ops_checklist_state').select('project_id, instructor_id, item_key, checked').in('project_id', projectIds),
          supabase.from('instructor_engagement_memo').select('project_id, instructor_id, memo').in('project_id', projectIds),
        ]);
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        (stateRows ?? []).forEach((r: any) => { map[`${r.project_id}:${r.instructor_id}:${r.item_key}`] = r.checked; });
        setCheckState(map);
        const memoMap: Record<string, string> = {};
        (memoRows ?? []).forEach((r: any) => { if (r.memo) memoMap[`${r.project_id}:${r.instructor_id}`] = r.memo; });
        setMemoState(memoMap);
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

  const openMemo = (projectId: number, instructorId: number) => {
    const key = `${projectId}:${instructorId}`;
    if (openMemoKey === key) { setOpenMemoKey(null); return; }
    setOpenMemoKey(key);
    setMemoDraft(memoState[key] ?? '');
  };

  const saveMemo = async (projectId: number, instructorId: number) => {
    const key = `${projectId}:${instructorId}`;
    setMemoSaving(true);
    const text = memoDraft.trim();
    await supabase.from('instructor_engagement_memo').upsert({
      project_id: projectId,
      instructor_id: instructorId,
      memo: text,
      updated_at: new Date().toISOString(),
      updated_by: profile?.name || profile?.email || null,
    }, { onConflict: 'project_id,instructor_id' });
    setMemoState((prev) => {
      const next = { ...prev };
      if (text) next[key] = text; else delete next[key];
      return next;
    });
    setMemoSaving(false);
    setOpenMemoKey(null);
  };

  // 실데이터에 실제로 존재하는 상태만 버튼으로 노출(정의되어 있어도 지금 아무도 없으면 안 보임)
  const availableStatuses = [...new Set(rows.map((r) => r.project_status ?? '미지정'))];
  const toggleStatus = (status: string) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (hiddenStatuses.has(r.project_status ?? '미지정')) return false;
    if (q && !`${r.instructor_name} ${r.project_name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // 강사별 그룹핑 (뷰가 이미 강사명순 정렬되어 있어 순서만 보존) — rowSpan에 사용
  const grouped: { instructorId: number; instructorName: string; items: EngagementRow[] }[] = [];
  for (const row of filteredRows) {
    const last = grouped[grouped.length - 1];
    if (last && last.instructorName === row.instructor_name) last.items.push(row);
    else grouped.push({ instructorId: row.instructor_id, instructorName: row.instructor_name, items: [row] });
  }

  return (
    <Card>
      <CardHeader title="강사 섭외 현황" icon={<Mic className="h-4 w-4 text-slate-400" />}
        action={<span className="text-[11px] text-slate-400">지급완료 건 제외 · 강사순</span>} />
      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-5 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="강사·프로젝트 검색"
              className="w-52 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-400" />
          </div>
          <span className="h-4 w-px bg-slate-200" />
          {availableStatuses.map((status) => {
            const active = !hiddenStatuses.has(status);
            return (
              <button key={status} onClick={() => toggleStatus(status)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active ? (STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-600') : 'bg-slate-50 text-slate-300 line-through'
                }`}>
                {status}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div className="px-5 pb-4 text-sm text-slate-400">불러오는 중...</div>
      ) : error ? (
        <div className="px-5 pb-4 text-sm text-red-500">불러오기 실패: {error}</div>
      ) : grouped.length === 0 ? (
        <div className="px-5 pb-4 text-sm text-slate-400">
          {rows.length === 0 ? '표시할 항목이 없습니다.' : '검색·필터 조건에 맞는 항목이 없습니다.'}
        </div>
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
                <th className="w-10 px-1.5 py-2 text-center text-xs font-semibold text-slate-500">메모</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                g.items.map((it, idx) => {
                  const sessionLabel = formatSessionDates(it.session_dates);
                  const memoKey = `${it.project_id}:${g.instructorId}`;
                  const hasMemo = !!memoState[memoKey];
                  const memoOpen = openMemoKey === memoKey;
                  return (
                    <React.Fragment key={it.project_id}>
                      <tr className="border-t border-slate-50 hover:bg-slate-50/60">
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
                        <td className="px-1.5 py-2 text-center">
                          <button onClick={() => openMemo(it.project_id, g.instructorId)}
                            title={hasMemo ? '메모 보기/수정' : '메모 추가'}
                            className={`rounded p-1 hover:bg-slate-100 ${hasMemo ? 'text-blue-500' : 'text-slate-300'}`}>
                            {hasMemo ? <MessageSquareText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {memoOpen && (
                        <tr className="border-t border-slate-50 bg-blue-50/40">
                          <td colSpan={5 + CHECKLIST_ITEMS.length} className="px-2 py-2">
                            <div className="flex items-start gap-2">
                              <textarea autoFocus value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)}
                                placeholder="이 강사·프로젝트 건에 대한 메모를 입력하세요"
                                rows={2}
                                className="flex-1 resize-none rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                              <div className="flex shrink-0 flex-col gap-1">
                                <button disabled={memoSaving} onClick={() => saveMemo(it.project_id, g.instructorId)}
                                  className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                  저장
                                </button>
                                <button onClick={() => setOpenMemoKey(null)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
