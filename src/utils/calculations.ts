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
  contractAmount > 0 ? Number(((profit / contractAmount) * 100).toFixed(1)) : 0;

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

export const getPendingPaymentRequests = (paymentRequests: PaymentRequest[]): PaymentRequest[] =>
  paymentRequests.filter((r) => r.status === '지급대상' || r.status === '지급요청');

// 대시보드 KPI 집계
export interface DashboardKpis {
  total: number;
  thisMonth: number;
  confirmedReady: number;
  inProgress: number;
  reportSettlement: number;
  paymentPending: number;
  taxInvoicePending: number;
  unpaidCollection: number;
  settlementPending: number;
  expectedRevenue: number;
  expectedProfit: number;
}

export const buildDashboardKpis = (
  projects: Project[],
  paymentRequests: PaymentRequest[],
): DashboardKpis => {
  const active = projects.filter((p) => p.projectStatus !== '취소/보류');
  const counts = countProjectsByStatus(projects);
  const expectedRevenue = active.reduce((s, p) => s + (p.contractAmount || 0), 0);
  const expectedProfit = active.reduce((s, p) => s + (p.expectedProfit || 0), 0);
  return {
    total: projects.length,
    thisMonth: getThisMonthProjects(projects).length,
    confirmedReady: counts['확정/준비'],
    inProgress: counts['운영중'],
    reportSettlement: counts['보고/정산'],
    paymentPending: getPendingPaymentRequests(paymentRequests).length,
    taxInvoicePending: active.filter((p) => !p.taxInvoiceIssued && p.revenueStatus !== '견적작성').length,
    unpaidCollection: active.filter((p) => !p.collectionCompleted && p.taxInvoiceIssued).length,
    settlementPending: active.filter(
      (p) => p.settlementStatus !== '결산완료' && p.settlementStatus !== '제외',
    ).length,
    expectedRevenue,
    expectedProfit,
  };
};
