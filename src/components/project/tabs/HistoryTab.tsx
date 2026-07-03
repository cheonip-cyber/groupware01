import { useEffect, useState } from 'react';
import type { Project, ProjectSyncLog } from '../../../types';
import { dataSource } from '../../../services/dataSource';
import { formatDate } from '../../../utils/formatters';
import { History, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

// 프로젝트 자체 히스토리는 아직 DB에 없어 Notion 동기화 이력(notion_sync_log)을 표시한다.
// (기존에는 항상 빈 배열이라 죽은 탭이었음 — 동기화 오류 추적 용도로 활용)
export function HistoryTab({ project }: { project: Project }) {
  const [logs, setLogs] = useState<ProjectSyncLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    dataSource.getProjectSyncLogs(project.id)
      .then((l) => { if (alive) setLogs(l); })
      .catch((e) => { if (alive) setError(e?.message ?? String(e)); });
    return () => { alive = false; };
  }, [project.id]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-700">Notion 동기화 이력</h4>
        <span className="text-[11px] text-slate-400">최근 50건</span>
      </div>
      {error && <p className="py-4 text-center text-xs text-red-500">이력 조회 실패: {error}</p>}
      {!error && logs === null && <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>}
      {!error && logs !== null && logs.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">
          동기화 기록이 없습니다. {project.notionPageId ? '' : '(노션 미연동 프로젝트)'}
        </p>
      )}
      {!error && logs !== null && logs.length > 0 && (
        <ol className="relative space-y-4 border-l border-slate-200 pl-6">
          {logs.map((log) => (
            <li key={log.id} className="relative">
              <span className={`absolute -left-[25px] flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2 ${log.status === 'error' ? 'ring-red-200 text-red-500' : 'ring-slate-200 text-slate-400'}`}>
                {log.direction === 'from_notion'
                  ? <ArrowDownToLine className="h-3 w-3" />
                  : <ArrowUpFromLine className="h-3 w-3" />}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${log.direction === 'from_notion' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                  {log.direction === 'from_notion' ? 'Notion → 그룹웨어' : '그룹웨어 → Notion'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${log.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {log.status === 'error' ? '오류' : '성공'}
                </span>
                <span className="text-[11px] text-slate-400">{formatDate(log.syncedAt)}</span>
              </div>
              <p className={`mt-1 break-all text-sm ${log.status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>{log.message}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
