import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { MonthBadge } from '../common/MonthBadge';
import { settlementStatusStyle } from '../../utils/statusConfig';
import { activeProjects, sortByCurrentYearFirst, filterByYearKeepOpen, isSettlementOpen } from '../../utils/filters';
import { CarryOverBadge, ScopeNote } from '../common/CarryOver';
import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SortableTh, useSortableRows } from '../common/SortableTh';
import type { Project } from '../../types';

type SettlementSortKey = 'projectName' | 'expectedProfit' | 'revenueMonth';
const settlementSortValue = (p: Project, key: SettlementSortKey) =>
  key === 'expectedProfit' ? p.expectedProfit
  : key === 'revenueMonth' ? (p.revenueMonth ?? '')
  : p.projectName;

export function SettlementPage() {
  const { projects, loading, globalYear } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  // 조회 연도로 거르되 미완료 건은 연도 무관 유지 → 기준 연도 우선 정렬(헤더 정렬 클릭 시 그 기준으로 바뀜)
  const active = sortByCurrentYearFirst(filterByYearKeepOpen(activeProjects(projects), globalYear, isSettlementOpen), globalYear);
  const { sorted, sortKey, dir, onSort } = useSortableRows<Project, SettlementSortKey>(active, settlementSortValue);
  return (
    <Card>
      <CardHeader title="정산/결산 현황" icon={<ClipboardCheck className="h-4 w-4 text-slate-400" />} />
      <ScopeNote year={globalYear} openLabel="미정산" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="w-10 px-3 py-2.5 font-medium">No.</th>
            <SortableTh label="매출월" sortKey="revenueMonth" active={sortKey === 'revenueMonth'} dir={dir} onSort={onSort} />
            <SortableTh label="프로젝트" sortKey="projectName" active={sortKey === 'projectName'} dir={dir} onSort={onSort} className="px-5" />
            <th className="px-3 py-2.5 font-medium">결산상태</th>
            <th className="px-3 py-2.5 font-medium">세금계산서</th>
            <th className="px-3 py-2.5 font-medium">수금</th>
            <th className="px-3 py-2.5 font-medium">지급완료</th>
            <SortableTh label="최종이익" sortKey="expectedProfit" active={sortKey === 'expectedProfit'} dir={dir} onSort={onSort} align="right" />
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((p, idx) => {
              const ok = 'text-emerald-600', no = 'text-red-400';
              return (
                <tr key={p.id} className="group hover:bg-slate-50">
                  <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-3"><MonthBadge yearMonth={p.revenueMonth} /></td>
                  <td className="px-5 py-3">
                    <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link><CarryOverBadge project={p} year={globalYear} />
                    <div className="text-xs text-slate-400">{p.clientName}</div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge label={p.settlementStatus} style={settlementStatusStyle[p.settlementStatus]} size="sm" /></td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.taxInvoiceIssued ? ok : no}`}>{p.taxInvoiceIssued ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.collectionCompleted ? ok : no}`}>{p.collectionCompleted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-xs font-medium ${p.paymentCompleted ? ok : no}`}>{p.paymentCompleted ? '완료' : '미완료'}</td>
                  <td className={`px-3 py-3 text-right font-medium ${p.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <MoneyText value={p.expectedProfit} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
