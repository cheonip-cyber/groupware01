import { Inbox } from 'lucide-react';

export function EmptyState({ title = '데이터가 없습니다', desc }: { title?: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-4 text-slate-400"><Inbox className="h-7 w-7" /></div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {desc && <p className="mt-1 text-xs text-slate-400">{desc}</p>}
    </div>
  );
}
