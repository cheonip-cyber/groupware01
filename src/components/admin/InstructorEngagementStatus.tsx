import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Card, CardHeader } from '../common/Card';
import { Mic } from 'lucide-react';

// 강사 섭외 현황 (2026-08-19 신설)
// — 노션 "강사섭외" 관계형 필드를 groupware.project_instructors 정션 테이블로 동기화한 결과를
//   groupware.instructor_engagement_status 뷰로 그대로 노출한다.
// — 정산(instructor_payments)이 이미 끝난 강사-프로젝트 조합은 뷰 단계에서 이미 제외되어 있음
//   (지급완료 = instructor_payments 기록 존재 여부 기준, 2026-08-19 확정).
// — 강사 기준 정렬, 한 강사가 여러 프로젝트에 걸려있으면 전부 표시.

interface EngagementRow {
  instructor_id: number;
  instructor_name: string;
  project_id: number;
  project_name: string;
  project_status: string | null;
  revenue_month: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  '요청/담당': 'bg-gray-100 text-gray-700',
  '제안/PT': 'bg-yellow-100 text-yellow-800',
  '확정/준비': 'bg-blue-100 text-blue-800',
  '준비': 'bg-purple-100 text-purple-800',
  '운영/모니터링': 'bg-pink-100 text-pink-800',
  '보고/정산': 'bg-green-100 text-green-800',
  '종료(수익화 완료)': 'bg-emerald-100 text-emerald-800',
  '취소/보류': 'bg-red-100 text-red-800',
};

export function InstructorEngagementStatus() {
  const [rows, setRows] = useState<EngagementRow[]>([]);
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
      if (error) setError(error.message);
      else setRows((data ?? []) as EngagementRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 강사별 그룹핑 (뷰가 이미 강사명순 정렬되어 있어 순서만 보존)
  const grouped: { instructorName: string; items: EngagementRow[] }[] = [];
  for (const row of rows) {
    const last = grouped[grouped.length - 1];
    if (last && last.instructorName === row.instructor_name) last.items.push(row);
    else grouped.push({ instructorName: row.instructor_name, items: [row] });
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
        <div className="divide-y divide-slate-50 px-5 pb-3">
          {grouped.map((g) => (
            <div key={g.instructorName} className="py-2.5">
              <div className="text-sm font-medium text-slate-700 mb-1.5">{g.instructorName}</div>
              <div className="space-y-1 pl-1">
                {g.items.map((it) => (
                  <div key={it.project_id} className="flex items-center gap-2 text-sm">
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        STATUS_COLOR[it.project_status ?? ''] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {it.project_status ?? '-'}
                    </span>
                    <span className="text-slate-600 truncate">{it.project_name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
