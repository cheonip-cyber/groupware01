import { useMemo, useState } from 'react';
import { profitRateLabel } from '../../utils/formatters';
import { activeProjects, sortByCurrentYearFirst, filterByYearKeepOpen, isPaymentOpen, projectYear } from '../../utils/filters';
import { CarryOverBadge, ScopeNote } from '../common/CarryOver';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Wallet, ChevronDown, ChevronRight, CornerDownRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SortableTh, useSortableRows } from '../common/SortableTh';
import { GROUP_TYPE_LABEL } from '../project/ProjectTable';
import type { Project } from '../../types';

// 예산/비용은 '묶음 단위'로 본다 (2026-07-27 결정)
// 그룹의 원가는 대개 한쪽(주로 마스터)에만 입력돼 있어, 개별 행으로 흩어 보면
// 비용 0인 행이 이익률 100%로 잘못 보인다(실데이터: 비용 입력된 그룹 21개의 81행 중 40행).
// 수익성은 묶음 전체의 매출 대비 원가로 판단해야 의미가 있으므로 합산 행으로 표시하고,
// 펼치면 구성원 개별 내역을 확인할 수 있게 한다.
interface BudgetRow {
  key: string;
  head: Project;        // 대표(마스터 또는 단독 프로젝트)
  members: Project[];   // 그룹이면 마스터+자식 전체, 단독이면 자기 자신만
  isGroup: boolean;
  contractAmount: number;
  expectedCost: number;
  actualCost: number;
  expectedProfit: number;
  profitRate: number;
}

// 그룹 합계는 유효매출(effectiveAmount)로 더한다 — 마스터·자식 이중계상 방지 규칙을 그대로 따름
const sumRow = (head: Project, members: Project[], isGroup: boolean): BudgetRow => {
  const contractAmount = members.reduce((s, m) => s + (m.effectiveAmount ?? m.contractAmount ?? 0), 0);
  const expectedCost = members.reduce((s, m) => s + (m.expectedCost ?? 0), 0);
  const actualCost = members.reduce((s, m) => s + (m.actualCost ?? 0), 0);
  const expectedProfit = contractAmount - expectedCost;
  const profitRate = contractAmount > 0
    ? Number(((expectedProfit / contractAmount) * 100).toFixed(1))
    : expectedProfit < 0 ? -100 : 0;
  return { key: head.id, head, members, isGroup, contractAmount, expectedCost, actualCost, expectedProfit, profitRate };
};

type BudgetSortKey = 'projectName' | 'contractAmount' | 'expectedCost' | 'actualCost' | 'expectedProfit' | 'profitRate';
const budgetSortValue = (r: BudgetRow, key: BudgetSortKey) => {
  switch (key) {
    case 'contractAmount': return r.contractAmount;
    case 'expectedCost': return r.expectedCost;
    case 'actualCost': return r.actualCost;
    case 'expectedProfit': return r.expectedProfit;
    case 'profitRate': return r.profitRate;
    default: return r.head.projectName;
  }
};

export function BudgetPage() {
  const { projects, loading, globalYear } = useAppData();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const all = activeProjects(projects);
    const byId = new Map(all.map((p) => [p.id, p]));
    const kidsOf = new Map<string, Project[]>();
    for (const p of all) {
      if (p.parentId && byId.has(p.parentId)) {
        if (!kidsOf.has(p.parentId)) kidsOf.set(p.parentId, []);
        kidsOf.get(p.parentId)!.push(p);
      }
    }
    // 그룹은 멤버 중 하나라도 조회 범위에 들면 '그룹 전체'를 합산한다.
    // (연도로 그룹을 쪼개면 원가가 다른 연도 멤버에 남아 이익률이 다시 왜곡되기 때문)
    const inScope = (ps: Project[]) => filterByYearKeepOpen(ps, globalYear, isPaymentOpen).length > 0;

    const out: BudgetRow[] = [];
    for (const p of all) {
      const kids = kidsOf.get(p.id);
      if (kids && kids.length > 0) {
        const members = [p, ...kids];
        if (inScope(members)) out.push(sumRow(p, members, true));
      } else if (!p.parentId || !byId.has(p.parentId)) {
        // 단독 프로젝트, 또는 마스터가 조회 대상에서 빠진 고아 자식
        if (inScope([p])) out.push(sumRow(p, [p], false));
      }
    }
    const order = sortByCurrentYearFirst(out.map((r) => r.head), globalYear);
    const rank = new Map(order.map((p, i) => [p.id, i]));
    return out.sort((a, b) => (rank.get(a.head.id) ?? 0) - (rank.get(b.head.id) ?? 0));
  }, [projects, globalYear]);

  const { sorted, sortKey, dir, onSort } = useSortableRows<BudgetRow, BudgetSortKey>(rows, budgetSortValue);
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Card>
      <CardHeader title="예산/비용 현황" icon={<Wallet className="h-4 w-4 text-slate-400" />} />
      <ScopeNote year={globalYear} openLabel="지급 미완료" />
      <p className="border-b border-slate-100 px-5 py-2 text-[11px] text-slate-400">
        묶음(그룹)은 <b className="text-slate-600">합계 한 줄</b>로 표시합니다 — 원가가 구성원 중 한 곳에만 입력돼 있어도 이익률이 정확합니다. 행을 클릭하면 구성원별 내역이 펼쳐집니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="w-10 px-3 py-2.5 font-medium">No.</th>
            <SortableTh label="프로젝트" sortKey="projectName" active={sortKey === 'projectName'} dir={dir} onSort={onSort} className="px-5" />
            <SortableTh label="계약금액" sortKey="contractAmount" active={sortKey === 'contractAmount'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="예상비용" sortKey="expectedCost" active={sortKey === 'expectedCost'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="실지출" sortKey="actualCost" active={sortKey === 'actualCost'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="예상이익" sortKey="expectedProfit" active={sortKey === 'expectedProfit'} dir={dir} onSort={onSort} align="right" />
            <SortableTh label="이익률" sortKey="profitRate" active={sortKey === 'profitRate'} dir={dir} onSort={onSort} align="right" />
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((r, idx) => {
              const p = r.head;
              const open = expanded.has(r.key);
              // 매출은 있는데 예산이 하나도 없으면 이익률 100%로 보인다 — 진짜 고수익인지 입력 누락인지 구분해준다
              const noBudget = r.contractAmount > 0 && r.expectedCost === 0;
              return [
                <tr key={r.key} className="group hover:bg-slate-50">
                  <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{idx + 1}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.isGroup && (
                        <button onClick={() => toggle(r.key)} title="구성원 펼치기"
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200">
                          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {GROUP_TYPE_LABEL[p.groupType ?? ''] ?? '그룹'} {r.members.length}건
                        </button>
                      )}
                      <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                      <CarryOverBadge project={p} year={globalYear} />
                      {noBudget && (
                        <span title="지출 예산이 등록되지 않아 이익률이 실제보다 높게 보입니다"
                          className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          <AlertTriangle className="h-2.5 w-2.5" />예산 미등록
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{p.clientName}</div>
                  </td>
                  <td className="px-3 py-3 text-right"><MoneyText value={r.contractAmount} /></td>
                  <td className="px-3 py-3 text-right"><MoneyText value={r.expectedCost} /></td>
                  <td className="px-3 py-3 text-right text-slate-500"><MoneyText value={r.actualCost > 0 ? r.actualCost : undefined} /></td>
                  <td className={`px-3 py-3 text-right font-medium ${r.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <MoneyText value={r.expectedProfit} />
                  </td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${r.profitRate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {profitRateLabel(r)}
                  </td>
                </tr>,
                ...(open ? r.members.map((m) => (
                  <tr key={`${r.key}-${m.id}`} className="bg-slate-50/60 text-xs">
                    <td className="px-3 py-2" />
                    <td className="px-5 py-2">
                      <span className="inline-flex items-center gap-1 pl-3 text-slate-500">
                        <CornerDownRight className="h-3 w-3 text-slate-300" />
                        <Link to={`/projects/${m.id}`} className="hover:text-blue-600">{m.projectName}</Link>
                        {m.id === p.id && <span className="rounded bg-slate-200 px-1 text-[10px] text-slate-600">대표</span>}
                        <span className="text-slate-300">{projectYear(m) ?? '연도 미지정'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500"><MoneyText value={m.effectiveAmount ?? m.contractAmount} /></td>
                    <td className="px-3 py-2 text-right text-slate-500"><MoneyText value={m.expectedCost} /></td>
                    <td className="px-3 py-2 text-right text-slate-400"><MoneyText value={m.actualCost > 0 ? m.actualCost : undefined} /></td>
                    <td className="px-3 py-2" colSpan={2} />
                  </tr>
                )) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
