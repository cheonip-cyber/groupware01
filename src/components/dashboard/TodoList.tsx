import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { Card, CardHeader } from '../common/Card';
import { ListTodo, ChevronRight } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

// 이번 주 해야 할 일: 액션이 필요한 프로젝트의 nextAction 노출
export function TodoList({ projects }: { projects: Project[] }) {
  const todos = projects
    .filter((p) => p.projectStatus !== '완료' && p.projectStatus !== '취소/보류' && p.nextAction && p.nextAction !== '완료')
    .slice(0, 8);
  return (
    <Card className="h-full">
      <CardHeader title="이번 주 해야 할 일" icon={<ListTodo className="h-4 w-4 text-slate-400" />} />
      {todos.length === 0 ? <EmptyState title="처리할 작업이 없습니다" /> : (
        <ul className="divide-y divide-slate-100">
          {todos.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{p.nextAction}</p>
                  <p className="truncate text-xs text-slate-400">{p.projectName}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
