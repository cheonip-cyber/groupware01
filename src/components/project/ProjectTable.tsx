import { Link } from 'react-router-dom';
import type { Project } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle, priorityStyle } from '../../utils/statusConfig';
import { formatDateRange } from '../../utils/formatters';
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

export function ProjectTable({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <EmptyState title="조건에 맞는 프로젝트가 없습니다" desc="필터를 변경해 보세요" />;
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
          {projects.map((p) => (
            <tr key={p.id} className="group hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link to={`/projects/${p.id}`} className="font-medium text-slate-800 group-hover:text-blue-600">{p.projectName}</Link>
                <div className="text-xs text-slate-400">{p.clientName}{p.riskFlags.length > 0 && <span className="ml-2 text-red-500">● 주의</span>}</div>
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
              <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={p.contractAmount} /></td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.profitRate}%</td>
              <td className="px-3 py-3 text-xs text-slate-500">{p.managerName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
