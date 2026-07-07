import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, priorityStyle } from '../../utils/statusConfig';
import { formatDateRange, profitRateLabel } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';

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

function Row({ p, no, matched, onOpenGroup }: {
  p: Project; no?: number; matched?: boolean; onOpenGroup?: () => void;
}) {
  const isGroupMaster = (p.groupChildCount ?? 0) > 0;
  return (
    <tr className="group hover:bg-slate-50">
      <td className="px-3 py-3 text-xs tabular-nums text-slate-400">{no ?? ''}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div>
            <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
            {p.notionMissing && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600" title="노션에서 원본이 삭제되었습니다">⚠ 노션삭제</span>}
            {isGroupMaster && p.groupType && (
              <button onClick={onOpenGroup}
                title="그룹 구성 보기 (회차/분배 내역 패널)"
                className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100">
                {GROUP_TYPE_LABEL[p.groupType] ?? '그룹'} {p.groupChildCount}건 ›
              </button>
            )}
            {matched && <span className="ml-1.5 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700">구성 일치</span>}
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
      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{profitRateLabel(p)}</td>
      <td className="px-3 py-3 text-xs text-slate-500">{p.managerName}</td>
    </tr>
  );
}

/**
 * projects: 최상위 행(마스터/독립). childrenIndex가 주어지면 마스터 행을 펼쳐 자식을 들여쓰기로 표시한다.
 */
// 들여쓰기 트리 폐기: 목록은 마스터 한 행만 유지(정렬·가독성 보존)하고,
// 그룹 구성은 배지 클릭 시 우측 슬라이드 패널에서 확인한다 (사용자 피드백 반영)
export function ProjectTable({ projects, childrenIndex, matchedMasterIds, startNo = 1, onOpenGroup }: {
  projects: Project[];
  childrenIndex?: Map<string, Project[]>;
  /** 페이지네이션 오프셋 반영 시작 번호 */
  startNo?: number;
  /** 검색이 그룹 구성(자식)에 매칭된 마스터 id — 행에 '구성 일치' 배지 표시 */
  matchedMasterIds?: Set<string>;
  /** 그룹 배지 클릭 → 구성 패널 열기 */
  onOpenGroup?: (master: Project) => void;
}) {
  if (projects.length === 0) return <EmptyState title="조건에 맞는 프로젝트가 없습니다" desc="필터를 변경해 보세요" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="w-10 px-3 py-2.5 font-medium">No.</th><th className="px-4 py-3 font-medium">프로젝트 / 고객사</th>
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
          {projects.map((p, __idx) => (
            <Row key={p.id} p={p} no={startNo + __idx}
              matched={matchedMasterIds?.has(p.id)}
              onOpenGroup={onOpenGroup ? () => onOpenGroup(p) : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// tbody 내 key를 유지하면서 여러 tr을 묶기 위한 래퍼
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
