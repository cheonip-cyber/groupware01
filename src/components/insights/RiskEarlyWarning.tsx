import { useMemo } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { activeProjects, projectYear } from '../../utils/filters';
import type { Project } from '../../types';
import { AlertTriangle } from 'lucide-react';

// 리스크 조기경보 (2026-08-04 최초 작성, 2026-08-27 공용 컴포넌트로 분리)
// — 경영현황(관리자 전용)에만 있던 걸 리포트 메뉴에서도 쓸 수 있도록 독립 컴포넌트로 추출.
//   year를 prop으로 받아 각자 자기 컨텍스트(useAppData)에서 스스로 계산한다(중복 코드 대신 재사용).

const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;

export function RiskEarlyWarning({ year }: { year: string }) {
  const { projects } = useAppData();

  const scoped = useMemo(
    () => activeProjects(projects).filter((p) => year === '전체' || projectYear(p) === year),
    [projects, year],
  );

  const riskProjects = useMemo(
    () => scoped.filter((p) => p.riskFlags && p.riskFlags.length > 0).sort((a, b) => eff(b) - eff(a)).slice(0, 6),
    [scoped],
  );
  // 회차형(recurring) 마스터는 세금계산서를 하위 회차별로 처리하므로(마스터 입력 UI 자체를 숨김)
  // 이 알림에서도 제외해야 실제로 확인할 필요가 없는 항목이 "미발행"으로 잘못 뜨지 않는다.
  const taxPending = useMemo(
    () => scoped.filter((p) => CONFIRMED.has(p.projectStatus) && !p.taxInvoiceIssued && !(p.groupType === 'recurring' && !p.parentId))
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')).slice(0, 6),
    [scoped],
  );
  const upcomingNoTrainer = useMemo(() => {
    const now = new Date();
    return scoped
      .filter((p) => (!p.trainerIds || p.trainerIds.length === 0) && p.projectStatus !== '제안중' && !!p.startDate)
      .filter((p) => { const diff = (new Date(p.startDate).getTime() - now.getTime()) / 86400000; return diff >= 0 && diff <= 14; })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 6);
  }, [scoped]);

  if (scoped.length === 0) return null;

  return (
    <Card>
      <CardHeader title="리스크 조기경보" icon={<AlertTriangle className="h-4 w-4 text-slate-400" />} />
      <div className="grid grid-cols-1 gap-5 p-5 pt-3 lg:grid-cols-3">
        <RiskList title="위험 플래그 (금액순)" items={riskProjects.map((p) => ({ label: p.projectName, sub: p.riskFlags.join(', '), amount: eff(p) }))} empty="해당 없음" />
        <RiskList title="세금계산서 미발행" items={taxPending.map((p) => ({ label: p.projectName, sub: p.clientName, amount: eff(p) }))} empty="전 건 발행 완료" />
        <RiskList title="강사 미확정 (D-14 이내)" items={upcomingNoTrainer.map((p) => ({ label: p.projectName, sub: p.startDate, amount: eff(p) }))} empty="해당 없음" />
      </div>
    </Card>
  );
}

function RiskList({ title, items, empty }: { title: string; items: { label: string; sub: string; amount: number }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">{title}</p>
      {items.length === 0 ? <p className="text-xs text-slate-300">{empty}</p> : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
              <p className="truncate font-medium text-slate-700">{it.label}</p>
              <p className="flex items-center justify-between text-[10px] text-slate-400"><span className="truncate">{it.sub}</span><MoneyText value={it.amount} compact className="text-slate-500" /></p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
