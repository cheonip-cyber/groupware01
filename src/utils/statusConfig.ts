// 상태별 색상 매핑 (사양서 10.2). Tailwind 클래스 기반 badge 스타일.
import type {
  ProjectStatus, RevenueStatus, PaymentStatus, SettlementStatus, Priority,
} from '../types';

export interface BadgeStyle { bg: string; text: string; dot: string; }

const make = (bg: string, text: string, dot: string): BadgeStyle => ({ bg, text, dot });

export const projectStatusStyle: Record<ProjectStatus, BadgeStyle> = {
  '제안중': make('bg-gray-100', 'text-gray-700', 'bg-gray-400'),
  '제안완료': make('bg-indigo-50', 'text-indigo-700', 'bg-indigo-500'),
  '확정/준비': make('bg-blue-50', 'text-blue-700', 'bg-blue-500'),
  '운영중': make('bg-amber-50', 'text-amber-700', 'bg-amber-500'),
  '보고/정산': make('bg-violet-50', 'text-violet-700', 'bg-violet-500'),
  '완료': make('bg-emerald-50', 'text-emerald-700', 'bg-emerald-600'),
  '취소/보류': make('bg-slate-100', 'text-slate-500', 'bg-slate-400'),
};

export const revenueStatusStyle: Record<RevenueStatus, BadgeStyle> = {
  '견적작성': make('bg-gray-100', 'text-gray-600', 'bg-gray-400'),
  '계약확정': make('bg-blue-50', 'text-blue-700', 'bg-blue-500'),
  '세금계산서 발행대기': make('bg-amber-50', 'text-amber-700', 'bg-amber-500'),
  '세금계산서 발행완료': make('bg-indigo-50', 'text-indigo-700', 'bg-indigo-500'),
  '수금대기': make('bg-orange-50', 'text-orange-700', 'bg-orange-500'),
  '수금완료': make('bg-emerald-50', 'text-emerald-700', 'bg-emerald-600'),
  '취소': make('bg-slate-100', 'text-slate-500', 'bg-slate-400'),
};

export const paymentStatusStyle: Record<PaymentStatus, BadgeStyle> = {
  '미등록': make('bg-gray-100', 'text-gray-600', 'bg-gray-400'),
  '지급대상': make('bg-blue-50', 'text-blue-700', 'bg-blue-500'),
  '지급요청': make('bg-amber-50', 'text-amber-700', 'bg-amber-500'),
  '지급완료': make('bg-emerald-50', 'text-emerald-700', 'bg-emerald-600'),
  '보류': make('bg-slate-100', 'text-slate-500', 'bg-slate-400'),
};

export const settlementStatusStyle: Record<SettlementStatus, BadgeStyle> = {
  '미시작': make('bg-gray-100', 'text-gray-600', 'bg-gray-400'),
  '자료수집': make('bg-blue-50', 'text-blue-700', 'bg-blue-500'),
  '정산중': make('bg-amber-50', 'text-amber-700', 'bg-amber-500'),
  '검토필요': make('bg-red-50', 'text-red-700', 'bg-red-500'),
  '결산완료': make('bg-emerald-50', 'text-emerald-700', 'bg-emerald-600'),
  '제외': make('bg-slate-100', 'text-slate-500', 'bg-slate-400'),
};

export const priorityStyle: Record<Priority, BadgeStyle> = {
  '높음': make('bg-red-50', 'text-red-700', 'bg-red-500'),
  '중간': make('bg-amber-50', 'text-amber-700', 'bg-amber-500'),
  '낮음': make('bg-slate-100', 'text-slate-500', 'bg-slate-400'),
};

// 차트용 컬러 (status chart)
export const projectStatusChartColor: Record<ProjectStatus, string> = {
  '제안중': '#9ca3af',
  '제안완료': '#6366f1',
  '확정/준비': '#3b82f6',
  '운영중': '#f59e0b',
  '보고/정산': '#8b5cf6',
  '완료': '#16a34a',
  '취소/보류': '#94a3b8',
};
