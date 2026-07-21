import { Link } from 'react-router-dom';
import type { ActiveProject } from '../../utils/filters';
import { getRiskProjects } from '../../utils/calculations';
import { Card, CardHeader } from '../common/Card';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export function RiskProjectList({ projects }: { projects: ActiveProject[] }) {
  const risks = getRiskProjects(projects);
  return (
    <Card className="h-full">
      <CardHeader title="주의 필요 프로젝트" icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
        action={<span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{risks.length}</span>} />
      {risks.length === 0 ? <EmptyState title="주의가 필요한 프로젝트가 없습니다" /> : (
        <ul className="divide-y divide-slate-100">
          {risks.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-red-50/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{p.projectName}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.riskFlags.map((r) => (
                      <span key={r} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">{r}</span>
                    ))}
                  </div>
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
