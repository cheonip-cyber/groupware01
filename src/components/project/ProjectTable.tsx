import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, priorityStyle } from '../../utils/statusConfig';
import { formatDateRange } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';
import { ChevronRight, CornerDownRight } from 'lucide-react';

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

function Row({ p, child, expandable, expanded, onToggle, highlight }: {
  p: Project; child?: boolean; expandable?: boolean; expanded?: boolean; onToggle?: () => void; highlight?: boolean;
}) {
  const isGroupMaster = (p.groupChildCount ?? 0) > 0;
  return (
    <tr className={`group hover:bg-slate-50 ${highlight ? 'bg-yellow-50' : child ? 'bg-slate-50/60' : ''}`}>
      <td className={`py-3 ${child ? 'pl-9 pr-4' : 'px-4'}`}>
        <div className="flex items-center gap-1.5">
          {expandable && (
            <button onClick={onToggle} className="rounded p-0.5 text-slate-400 hover:bg-slate-200" title={expanded ? '접기' : `구성 ${p.groupChildCount}건 펼치기`}>
              <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
          {child && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
          <div>
            <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
            {isGroupMaster && p.groupType && (
              <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">
                {GROUP_TYPE_LABEL[p.groupType] ?? '그룹'} {p.groupChildCount}건
              </span>
            )}
            <div className="text-xs text-slate-400">{p.clientName}{p.riskFlags.length > 0 && <span className="ml-2 text-red-500">● 주의</span>}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatDateRange(p.startDate, p.endDate)}</td>
      <td className="px-3 py-3 text-xs tabular-nums text-slate-500">{p.revenueMonth ?? '-'}</td>
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
      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.profitRate}%</td>
      <td className="px-3 py-3 text-xs text-slate-500">{p.managerName}</td>
    </tr>
  );
}

/**
 * projects: 최상위 행(마스터/독립). childrenIndex가 주어지면 마스터 행을 펼쳐 자식을 들여쓰기로 표시한다.
 */
export function ProjectTable({ projects, childrenIndex, forceExpandedIds, highlightIds }: {
  projects: Project[];
  childrenIndex?: Map<string, Project[]>;
  /** 검색 매칭 등으로 자동 펼칠 마스터 id (수동 토글과 병합) */
  forceExpandedIds?: Set<string>;
  /** 하이라이트할 자식 id (검색 매칭 표시) */
  highlightIds?: Set<string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (projects.length === 0) return <EmptyState title="조건에 맞는 프로젝트가 없습니다" desc="필터를 변경해 보세요" />;

  const toggle = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="px-4 py-3 font-medium">프로젝트 / 고객사</th>
            <th className="px-3 py-3 font-medium">교육일정</th>
            <th className="px-3 py-3 font-medium">매출월</th>
            <th className="px-3 py-3 font-medium">우선순위</th>
            <th className="px-3 py-3 font-medium">프로젝트</th>
            <th className="px-3 py-3 font-medium">자금 진행</th>
            <th className="px-3 py-3 text-right font-medium">계약금액</th>
            <th className="px-3 py-3 text-right font-medium">이익률</th>
            <th className="px-3 py-3 font-medium">담당</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((p) => {
            const kids = childrenIndex?.get(p.id) ?? [];
            const isOpen = expanded.has(p.id) || !!forceExpandedIds?.has(p.id);
            return (
              <FragmentRow key={p.id}>
                <Row p={p} expandable={kids.length > 0} expanded={isOpen} onToggle={() => toggle(p.id)} />
                {isOpen && kids.map((c) => <Row key={c.id} p={c} child highlight={highlightIds?.has(c.id)} />)}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// tbody 내 key를 유지하면서 여러 tr을 묶기 위한 래퍼
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
