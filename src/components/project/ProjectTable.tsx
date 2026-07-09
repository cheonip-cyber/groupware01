import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project, RevenueDistribution } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, priorityStyle } from '../../utils/statusConfig';
import { formatDateRange, profitRateLabel, formatDate, formatMonthOnly } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';
import { dataSource } from '../../services/dataSource';
import { ChevronRight, CornerDownRight, Receipt, Wallet } from 'lucide-react';
import { SortableTh } from '../common/SortableTh';
import type { ProjectFilterState } from '../../utils/filters';

// 자금 3축(매출·지급·결산) 요약 점: 회색=미시작, 파랑 테두리=진행중, 채움=완료 (상세는 툴팁)
function FundDot({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  const cls = done
    ? 'bg-emerald-500 text-white ring-emerald-500'
    : active
      ? 'bg-blue-50 text-blue-600 ring-blue-300'
      : 'bg-slate-50 text-slate-300 ring-slate-200';
  return <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${cls}`}>{label}</span>;
}

export const GROUP_TYPE_LABEL: Record<string, string> = {
  distribution: '매출분배',
  recurring: '다회차',
  merged: '묶음',
};

// 자식 프로젝트(merged/recurring) 1행 — 마스터 행 아래 펼쳐질 때 표시
function ChildProjectRow({ c }: { c: Project }) {
  return (
    <tr className="bg-indigo-50/30">
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-400">{formatMonthOnly(c.revenueMonth)}</td>
      <td className="px-4 py-2 pl-8">
        <div className="flex items-center gap-1.5 text-sm">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
          <Link to={`/projects/${c.id}`} className="font-medium text-slate-600 hover:text-indigo-600">{c.projectName}</Link>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">{formatDateRange(c.startDate, c.endDate)}</td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"><StatusBadge label={c.projectStatus} style={projectStatusStyle[c.projectStatus]} size="sm" /></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2 text-right text-sm text-slate-600"><MoneyText value={c.finalEstimate ?? c.contractAmount} /></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
    </tr>
  );
}

// 매출분배(계열사) 행들 — revenue_distributions에서 지연 로딩. 세금계산서/입금 완료 여부만 표시(읽기전용, 편집은 상세화면)
function DistributionRows({ masterId, colSpan }: { masterId: string; colSpan: number }) {
  const [items, setItems] = useState<RevenueDistribution[] | null>(null);
  useEffect(() => { dataSource.getDistributions(masterId).then(setItems); }, [masterId]);

  if (items === null) return <tr className="bg-indigo-50/30"><td colSpan={colSpan} className="px-8 py-2 text-xs text-slate-400">불러오는 중…</td></tr>;
  if (items.length === 0) return <tr className="bg-indigo-50/30"><td colSpan={colSpan} className="px-8 py-2 text-xs text-slate-400">등록된 계열사가 없습니다</td></tr>;

  return (
    <>
      {items.map((d) => (
        <tr key={d.id} className="bg-indigo-50/30">
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2"></td>
          <td className="px-4 py-2 pl-8" colSpan={2}>
            <div className="flex items-center gap-1.5 text-sm">
              <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
              <span className="font-medium text-slate-600">{d.clientName}</span>
              {d.distributionRatio != null && <span className="text-[10px] text-slate-400">{d.distributionRatio}%</span>}
            </div>
          </td>
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2">
            <span className="flex items-center gap-2 text-[11px]">
              <span className={`flex items-center gap-1 ${d.taxInvoiceIssued ? 'text-emerald-600' : 'text-slate-300'}`}><Receipt className="h-3 w-3" />{d.taxInvoiceIssued ? formatDate(d.taxInvoiceDate) : '미발행'}</span>
              <span className={`flex items-center gap-1 ${d.paymentReceived ? 'text-emerald-600' : 'text-slate-300'}`}><Wallet className="h-3 w-3" />{d.paymentReceived ? formatDate(d.paymentDate) : '미입금'}</span>
            </span>
          </td>
          <td className="px-3 py-2 text-right text-sm text-slate-600"><MoneyText value={d.amount} /></td>
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2"></td>
          <td className="px-3 py-2"></td>
        </tr>
      ))}
    </>
  );
}

function Row({ p, no, matched, expanded, onToggleExpand, children }: {
  p: Project; no?: number; matched?: boolean;
  expanded: boolean; onToggleExpand: () => void; children?: Project[];
}) {
  const isGroupMaster = (p.groupChildCount ?? 0) > 0;
  return (
    <tr className="group hover:bg-slate-50">
      <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{no ?? ''}</td>
      <td className="px-3 py-3 text-xs tabular-nums text-slate-500">{formatMonthOnly(p.revenueMonth)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {isGroupMaster && (
            <button onClick={onToggleExpand} title="구성 펼치기/접기" className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-indigo-600">
              <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
          <div>
            <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
            {p.notionMissing && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600" title="노션에서 원본이 삭제되었습니다">⚠ 노션삭제</span>}
            {isGroupMaster && p.groupType && (
              <button onClick={onToggleExpand}
                title="그룹 구성 펼치기/접기"
                className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100">
                {GROUP_TYPE_LABEL[p.groupType] ?? '그룹'} {p.groupChildCount}건 {expanded ? '▲' : '▼'}
              </button>
            )}
            {matched && <span className="ml-1.5 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700">구성 일치</span>}
            <div className="text-xs text-slate-400">{p.clientName}{p.riskFlags.length > 0 && <span className="ml-2 text-red-500">● 주의</span>}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatDateRange(p.startDate, p.endDate)}</td>
      <td className="px-3 py-3"><StatusBadge label={p.priority} style={priorityStyle[p.priority]} size="sm" /></td>
      <td className="px-3 py-3"><StatusBadge label={p.projectStatus} style={projectStatusStyle[p.projectStatus]} size="sm" /></td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5" title={`매출: ${p.revenueStatus} · 지급: ${p.paymentStatus} · 결산: ${p.settlementStatus}`}>
          <FundDot label="매" done={p.revenueStatus === '수금완료'} active={p.revenueStatus !== '견적작성'} />
          <FundDot label="지" done={p.paymentStatus === '지급완료'} active={p.paymentStatus !== '지급대상'} />
          <FundDot label="결" done={p.settlementStatus === '결산완료'} active={p.settlementStatus !== '미시작'} />
        </span>
      </td>
      <td className="px-3 py-3 text-right text-slate-700">
        {isGroupMaster ? (
          <span title="그룹 합계 (이중계상 없이 자식 금액 기준)">
            <MoneyText value={p.groupTotalAmount ?? p.contractAmount} />
            <span className="ml-1 text-[10px] text-indigo-400">합계</span>
          </span>
        ) : <MoneyText value={p.contractAmount} />}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{profitRateLabel(p)}</td>
      <td className="px-3 py-3 text-xs text-slate-500">{p.managerName}</td>
    </tr>
  );
}

/**
 * projects: 최상위 행(마스터/독립). 마스터 행을 클릭하면 바로 아래로 구성(회차/분배)이 펼쳐진다.
 * (2026-07-08: 그룹지정 전 유형 공통 UX로 확정 — 우측 슬라이드 패널 방식 폐기)
 */
export function ProjectTable({ projects, childrenIndex, matchedMasterIds, startNo = 1, autoExpandIds, sort, sortDir, onSort }: {
  projects: Project[];
  childrenIndex?: Map<string, Project[]>;
  /** 페이지네이션 오프셋 반영 시작 번호 */
  startNo?: number;
  /** 검색이 그룹 구성(자식)에 매칭된 마스터 id — 행에 '구성 일치' 배지 표시 */
  matchedMasterIds?: Set<string>;
  /** 검색/필터가 자식에 매칭된 마스터 id — 자동으로 펼쳐서 보여준다 */
  autoExpandIds?: Set<string>;
  /** 제목줄 클릭 정렬 (부모 필터 상태와 연동, 페이지네이션 이전에 정렬됨) */
  sort: ProjectFilterState['sort'];
  sortDir: 'asc' | 'desc';
  onSort: (key: ProjectFilterState['sort']) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (autoExpandIds && autoExpandIds.size > 0) setExpanded((prev) => new Set([...prev, ...autoExpandIds]));
  }, [autoExpandIds]);

  if (projects.length === 0) return <EmptyState title="조건에 맞는 프로젝트가 없습니다" desc="필터를 변경해 보세요" />;

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="w-10 px-3 py-2.5 font-medium">No.</th>
            <SortableTh label="매출월" sortKey="revenueMonth" active={sort === 'revenueMonth'} dir={sortDir} onSort={onSort} />
            <th className="px-4 py-3 font-medium">프로젝트 / 고객사</th>
            <SortableTh label="교육일정" sortKey="startDate" active={sort === 'startDate'} dir={sortDir} onSort={onSort} />
            <th className="px-3 py-3 font-medium">우선순위</th>
            <th className="px-3 py-3 font-medium">프로젝트</th>
            <th className="px-3 py-3 font-medium">자금 진행</th>
            <SortableTh label="계약금액" sortKey="contractAmount" active={sort === 'contractAmount'} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="이익률" sortKey="profitRate" active={sort === 'profitRate'} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="담당" sortKey="managerName" active={sort === 'managerName'} dir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((p, __idx) => {
            const isOpen = expanded.has(p.id);
            return (
              <Fragment key={p.id}>
                <Row p={p} no={startNo + __idx}
                  matched={matchedMasterIds?.has(p.id)}
                  expanded={isOpen} onToggleExpand={() => toggle(p.id)} />
                {isOpen && p.groupType === 'distribution' && <DistributionRows key={`${p.id}-dist`} masterId={p.id} colSpan={10} />}
                {isOpen && p.groupType !== 'distribution' && (childrenIndex?.get(p.id) ?? []).map((c) => <ChildProjectRow key={c.id} c={c} />)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
