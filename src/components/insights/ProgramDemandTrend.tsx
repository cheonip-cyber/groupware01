import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { activeProjects, projectYear } from '../../utils/filters';
import type { Project } from '../../types';
import { BookOpen, Flame, Minus, Snowflake } from 'lucide-react';
import { eff, CONFIRMED_STATUSES as CONFIRMED } from '../../utils/calculations';

// 프로그램(주제) 수요 트렌드 (2026-08-04 최초 작성, 2026-08-27 공용 컴포넌트로 분리)
// — 경영현황(관리자 전용)에만 있던 걸 리포트 메뉴에서도 쓸 수 있도록 독립 컴포넌트로 추출.

export function ProgramDemandTrend({ year }: { year: string }) {
  const { projects } = useAppData();

  const confirmed = useMemo(() => {
    const scoped = activeProjects(projects).filter((p) => year === '전체' || projectYear(p) === year);
    return scoped.filter((p) => CONFIRMED.has(p.projectStatus) && eff(p) > 0);
  }, [projects, year]);

  const programTrend = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const p of confirmed) {
      const topic = p.topic || '미분류';
      const y = projectYear(p);
      if (!y) continue;
      if (!map.has(topic)) map.set(topic, {});
      const byYear = map.get(topic)!;
      byYear[y] = (byYear[y] || 0) + 1;
    }
    return [...map.entries()]
      .map(([topic, byYear]) => {
        const years = Object.keys(byYear).sort();
        const total = Object.values(byYear).reduce((s, n) => s + n, 0);
        let trend: 'rising' | 'stable' | 'declining' | 'na' = 'na';
        if (years.length >= 2) {
          const latest = byYear[years[years.length - 1]];
          const prev = byYear[years[years.length - 2]];
          trend = latest > prev * 1.1 ? 'rising' : latest < prev * 0.9 ? 'declining' : 'stable';
        }
        return { topic, total, trend };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [confirmed]);

  if (confirmed.length === 0) return null;

  return (
    <Card>
      <CardHeader title="프로그램(주제) 수요 트렌드" icon={<BookOpen className="h-4 w-4 text-slate-400" />}
        action={<span className="text-[11px] text-slate-400">전년 대비 ±10% 기준</span>} />
      <ul className="divide-y divide-slate-50 px-5 pb-3">
        {programTrend.map((p) => (
          <li key={p.topic} className="flex items-center gap-2 py-2 text-sm">
            <span className="flex-1 truncate font-medium text-slate-700">{p.topic}</span>
            <TrendBadge trend={p.trend} />
            <span className="w-10 text-right text-xs text-slate-400">{p.total}건</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TrendBadge({ trend }: { trend: 'rising' | 'stable' | 'declining' | 'na' }) {
  if (trend === 'na') return <span className="text-[10px] text-slate-300">데이터부족</span>;
  const cfg = {
    rising: { icon: Flame, label: '상승', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
    stable: { icon: Minus, label: '유지', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    declining: { icon: Snowflake, label: '하락', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  }[trend];
  const Icon = cfg.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}><Icon className="h-2.5 w-2.5" />{cfg.label}</span>;
}
