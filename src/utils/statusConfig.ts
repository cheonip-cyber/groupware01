// 상태별 색상 매핑 — Dot & Ink 디자인 시스템 (UI/UX 설계안 §4).
// 6단계 시맨틱 램프(neutral/progress/active/warn/success/danger)를 상태 성격에 맞게 배정하고,
// 색만이 아니라 점(dot)의 형태로도 상태를 구분한다 (solid=종결, pulse=진행중, ring=대기, alert=문제).
import type {
  ProjectStatus, RevenueStatus, PaymentStatus, SettlementStatus, Priority,
} from '../types';

export type DotKind = 'solid' | 'pulse' | 'ring' | 'alert';
export interface BadgeStyle { bg: string; text: string; dot: string; dotKind: DotKind; }

// 시맨틱 램프 → Tailwind 클래스 프리셋 (8% 배경 틴트 + 700 텍스트 = 대비 4.5:1 이상)
const RAMP = {
  neutral:  { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: '#64748B' },
  progress: { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: '#2E5BE6' },
  active:   { bg: 'bg-violet-50',  text: 'text-violet-700', dot: '#7C3AED' },
  warn:     { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: '#D97706' },
  success:  { bg: 'bg-emerald-50', text: 'text-emerald-700',dot: '#059669' },
  danger:   { bg: 'bg-red-50',     text: 'text-red-700',    dot: '#DC2626' },
} as const;

const make = (ramp: keyof typeof RAMP, dotKind: DotKind): BadgeStyle => ({
  bg: RAMP[ramp].bg, text: RAMP[ramp].text, dot: RAMP[ramp].dot, dotKind,
});

export const projectStatusStyle: Record<ProjectStatus, BadgeStyle> = {
  '제안중': make('neutral', 'ring'),
  '제안완료': make('progress', 'solid'),
  '확정/준비': make('progress', 'solid'),
  '운영중': make('active', 'pulse'),
  '보고/정산': make('active', 'pulse'),
  '완료': make('success', 'solid'),
  '취소/보류': make('neutral', 'solid'),
};

export const revenueStatusStyle: Record<RevenueStatus, BadgeStyle> = {
  '견적작성': make('neutral', 'ring'),
  '계약확정': make('progress', 'solid'),
  '세금계산서 발행대기': make('warn', 'ring'),
  '세금계산서 발행완료': make('progress', 'solid'),
  '수금대기': make('warn', 'ring'),
  '수금완료': make('success', 'solid'),
  '취소': make('neutral', 'solid'),
};

export const paymentStatusStyle: Record<PaymentStatus, BadgeStyle> = {
  '미등록': make('neutral', 'ring'),
  '지급대상': make('progress', 'solid'),
  '지급요청': make('warn', 'ring'),
  '지급완료': make('success', 'solid'),
  '보류': make('neutral', 'ring'),
};

export const settlementStatusStyle: Record<SettlementStatus, BadgeStyle> = {
  '미시작': make('neutral', 'ring'),
  '자료수집': make('progress', 'solid'),
  '정산중': make('active', 'pulse'),
  '검토필요': make('danger', 'alert'),
  '결산완료': make('success', 'solid'),
  '제외': make('neutral', 'solid'),
};

export const priorityStyle: Record<Priority, BadgeStyle> = {
  '높음': make('danger', 'solid'),
  '중간': make('warn', 'solid'),
  '낮음': make('neutral', 'solid'),
};

// 차트용 컬러 — 배지와 동일한 시맨틱 램프에서 파생 (상태색 = 차트색 일치)
export const projectStatusChartColor: Record<ProjectStatus, string> = {
  '제안중': RAMP.neutral.dot,
  '제안완료': RAMP.progress.dot,
  '확정/준비': RAMP.progress.dot,
  '운영중': RAMP.active.dot,
  '보고/정산': RAMP.active.dot,
  '완료': RAMP.success.dot,
  '취소/보류': '#94a3b8',
};
