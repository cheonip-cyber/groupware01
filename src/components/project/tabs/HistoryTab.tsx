import type { Project } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import { History } from 'lucide-react';

const typeIcon: Record<string, string> = {
  '상태변경': '🔄',
  '메모': '📝',
  '시스템': '⚙️',
};
const typeCls: Record<string, string> = {
  '상태변경': 'bg-blue-50 text-blue-700',
  '메모': 'bg-amber-50 text-amber-700',
  '시스템': 'bg-slate-100 text-slate-500',
};

export function HistoryTab({ project }: { project: Project }) {
  const logs = [...(project.history ?? [])].reverse();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-700">변경 히스토리</h4>
      </div>
      {logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">기록이 없습니다.</p>
      ) : (
        <ol className="relative border-l border-slate-200 pl-6 space-y-5">
          {logs.map((log) => (
            <li key={log.id} className="relative">
              <span className="absolute -left-[25px] flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2 ring-slate-200 text-[11px]">
                {typeIcon[log.type] ?? '•'}
              </span>
              <div className="flex flex-wrap items-start gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeCls[log.type] ?? 'bg-slate-100 text-slate-500'}`}>
                  {log.type}
                </span>
                <span className="text-[11px] text-slate-400">{formatDate(log.at)} · {log.actor}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{log.message}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
