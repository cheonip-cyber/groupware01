import type { Project, ProjectStatus } from '../types';
import type { PaymentRequest } from '../types';

// 부가세 10% 기준 (사양서 9장)
export const calculateSupplyAmount = (totalAmount: number): number =>
  Math.round(totalAmount / 1.1);

export const calculateVat = (supplyAmount: number): number =>
  Math.round(supplyAmount * 0.1);

export const calculateProfit = (contractAmount: number, actualCost: number): number =>
  contractAmount - actualCost;

export const calculateProfitRate = (profit: number, contractAmount: number): number =>
  contractAmount > 0 ? Number(((profit / contractAmount) * 100).toFixed(1)) : profit < 0 ? -100 : 0;

const ALL_STATUSES: ProjectStatus[] = [
  '제안중', '제안완료', '확정/준비', '운영중', '보고/정산', '완료', '취소/보류',
];

export const countProjectsByStatus = (projects: Project[]): Record<ProjectStatus, number> => {
  const acc = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>;
  for (const p of projects) acc[p.projectStatus] = (acc[p.projectStatus] ?? 0) + 1;
  return acc;
};

// 주의 필요 프로젝트 (사양서 6.1 D) — riskFlags 기반
export const getRiskProjects = (projects: Project[]): Project[] =>
  projects.filter((p) => p.riskFlags && p.riskFlags.length > 0 && p.projectStatus !== '취소/보류');

// 이번 달 교육 예정
export const getThisMonthProjects = (projects: Project[]): Project[] => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return projects.filter((p) => (p.startDate || '').startsWith(ym));
};

export const getRequestedPayments = (paymentRequests: PaymentRequest[]): PaymentRequest[] =>
  paymentRequests.filter((r) => r.status === '지급요청');

export const getUnrequestedPayments = (paymentRequests: PaymentRequest[]): PaymentRequest[] =>
  paymentRequests.filter((r) => r.status === '지급대상');

// 대시보드 KPI 집계
export interface DashboardKpis {
  total: number;
  thisMonth: number;
  confirmedReady: number;
  inProgress: number;
  reportSettlement: number;
  paymentPending: number;      // 지급요청 완료 후 이체 대기 중인 건 (지급요청 상태)
  paymentTarget: number;       // 아직 요청 전(지급대상) 건 — 요청 여부 검토 필요
  taxInvoicePending: number;
  unpaidCollection: number;
  settlementPending: number;
  confirmedRevenue: number;   // 확정 매출: 확정/준비·운영중·보고/정산·완료
  expectedRevenue: number;    // 예상 매출: 제안 단계(제안중)
  expectedProfit: number;     // 이익 = 매출 − 예산비용 (구 그룹웨어 방식)
  profitRate: number;         // 이익률 = 이익/총매출 ×100
}

export const buildDashboardKpis = (
  projects: Project[],
  paymentRequests: PaymentRequest[],
): DashboardKpis => {
  const active = projects.filter((p) => p.projectStatus !== '취소/보류');
  const counts = countProjectsByStatus(projects);
  // 매출 규칙(구 그룹웨어 방식): 확정군(확정/준비·운영중·보고/정산·완료)=확정 매출, 제안중=예상 매출, 취소/보류=미반영
  // 금액은 유효매출(effectiveAmount) 기준 — 그룹 마스터는 자식이 금액을 가지면 0 (이중계상 제거)
  const CONFIRMED_SET = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
  const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;
  const confirmedRevenue = active.filter((p) => CONFIRMED_SET.has(p.projectStatus)).reduce((s, p) => s + eff(p), 0);
  const expectedRevenue = active.filter((p) => p.projectStatus === '제안중').reduce((s, p) => s + eff(p), 0);
  // 이익 = Σ(유효매출 − 예산비용) — 구 뷰 profit_max와 동일 공식
  const expectedProfit = active.reduce((s, p) => s + (eff(p) - (p.expectedCost || 0)), 0);
  // 총 이익률: 예산이 입력되지 않은 프로젝트(비용 0 → 이익률 100%)는 왜곡을 만들므로 산정 베이스에서 제외
  const rateBase = active.filter((p) => (p.expectedCost || 0) > 0);
  const rateRevenue = rateBase.reduce((s, p) => s + eff(p), 0);
  const rateProfit = rateBase.reduce((s, p) => s + (eff(p) - (p.expectedCost || 0)), 0);
  const profitRate = rateRevenue > 0 ? Number(((rateProfit / rateRevenue) * 100).toFixed(1)) : 0;
  return {
    total: projects.length,
    thisMonth: getThisMonthProjects(projects).length,
    confirmedReady: counts['확정/준비'],
    inProgress: counts['운영중'],
    reportSettlement: counts['보고/정산'],
    paymentPending: getRequestedPayments(paymentRequests).length,
    paymentTarget: getUnrequestedPayments(paymentRequests).length,
    taxInvoicePending: active.filter((p) => !p.taxInvoiceIssued && p.revenueStatus !== '견적작성').length,
    unpaidCollection: active.filter((p) => !p.collectionCompleted && p.taxInvoiceIssued).length,
    settlementPending: active.filter(
      (p) => p.settlementStatus !== '결산완료' && p.settlementStatus !== '제외',
    ).length,
    confirmedRevenue,
    expectedRevenue,
    expectedProfit,
    profitRate,
  };
};
