import type { Project, ProjectStatus, PaymentRequest } from '../types';
import type { ActiveProject, ActivePaymentRequest } from './filters';

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

// 2026-08-27: 여러 파일(BusinessInsights/ReportsPage/AdminOverviewPage/인사이트 컴포넌트 등)에
// eff()·CONFIRMED가 각자 따로 정의되어 있어(내용은 우연히 동일했지만) 한 곳만 고치면 조용히
// 어긋날 위험이 있었음 — 공용 버전을 여기서 export하고 각 파일은 이걸 import해서 쓰도록 통합.
export const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;
export const CONFIRMED_STATUSES = new Set<ProjectStatus>(['확정/준비', '운영중', '보고/정산', '완료']);

export const countProjectsByStatus = (projects: Project[]): Record<ProjectStatus, number> => {
  const acc = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>;
  for (const p of projects) acc[p.projectStatus] = (acc[p.projectStatus] ?? 0) + 1;
  return acc;
};

// 2026-08-27 신설: "프로젝트 건수"는 회차/자식을 마스터와 별개 건으로 세면 안 된다는 지적으로
// 도입 — 그룹(마스터+회차)은 1건으로만 세고, 회차 수는 별도로 붙여서 "1건(5회)" 형태로 표시할
// 수 있게 한다. 최상위(parentId 없는) 프로젝트만 대상으로 하고, 상태는 마스터 자신의 상태를 쓴다.
export const dedupedForCounting = (projects: Project[]): Project[] => projects.filter((p) => !p.parentId);

export const childCountMap = (projects: Project[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const p of projects) {
    if (!p.parentId) continue;
    map.set(p.parentId, (map.get(p.parentId) ?? 0) + 1);
  }
  return map;
};

export const countProjectsByStatusDeduped = (projects: Project[]): Record<ProjectStatus, number> =>
  countProjectsByStatus(dedupedForCounting(projects));

// 주의 필요 프로젝트 (사양서 6.1 D) — riskFlags 기반. ActiveProject만 받으므로 호출부에서
// activeProjects()를 거치지 않으면 타입 에러 — 취소/보류 제외를 빠뜨릴 수 없다.
export const getRiskProjects = (projects: ActiveProject[]): ActiveProject[] =>
  projects.filter((p) => p.riskFlags && p.riskFlags.length > 0);

// 이번 달 교육 예정
export const getThisMonthProjects = (projects: ActiveProject[]): ActiveProject[] => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return projects.filter((p) => (p.startDate || '').startsWith(ym));
};

export const getRequestedPayments = (paymentRequests: ActivePaymentRequest[]): ActivePaymentRequest[] =>
  paymentRequests.filter((r) => r.status === '지급요청');

export const getUnrequestedPayments = (paymentRequests: ActivePaymentRequest[]): ActivePaymentRequest[] =>
  paymentRequests.filter((r) => r.status === '지급대상');

// 대시보드 KPI 집계
export interface DashboardKpis {
  total: number;
  totalWithSessions: number;  // 회차 포함 원본 건수(그룹 안 회차까지 각각 센 값) — "N건(M회)" 표기용
  thisMonth: number;
  confirmedReady: number;
  confirmedReadyWithSessions: number;
  inProgress: number;
  inProgressWithSessions: number;
  reportSettlement: number;
  reportSettlementWithSessions: number;
  paymentPending: number;      // 지급요청 완료 후 이체 대기 중인 건 (지급요청 상태)
  paymentTarget: number;       // 아직 요청 전(지급대상) 건 — 요청 여부 검토 필요
  taxInvoicePending: number;
  unpaidCollection: number;
  settlementPending: number;
  confirmedRevenue: number;   // 확정 매출: 확정/준비·운영중·보고/정산·완료
  expectedRevenue: number;    // 예상 매출: 제안 단계(제안중)
  expectedProfit: number;     // 이익 = 매출 − 예산비용 (구 그룹웨어 방식)
  profitRate: number;         // 이익률 = 이익/총매출 ×100 (예산 미입력 프로젝트 제외 베이스)
  profitRateDeviation: number; // ±편차: 예산 미입력 프로젝트의 매출을 포함시켰을 때 최선/최악 가정 사이의 흔들림 폭(%p)
}

// 회차형(recurring) 그룹의 마스터인지 판별. 마스터 자신은 세금계산서/수금/정산을 직접
// 처리하지 않고(하위 회차별로 각자 처리, RevenueTab에서도 UI 숨김) 마스터 필드값은 참고용으로
// 남아있을 뿐이라 카운트 집계에서는 제외해야 한다(2026-08-25).
const isRecurringMaster = (p: Project) => p.groupType === 'recurring' && !p.parentId;

// projects/paymentRequests는 반드시 activeProjects()/activePayments()를 거친 결과여야 한다
// (파라미터 타입이 ActiveProject[]/ActivePaymentRequest[]라 그냥 원본 배열을 넘기면 빌드 에러가 난다).
export const buildDashboardKpis = (
  active: ActiveProject[],
  activePayments: ActivePaymentRequest[],
): DashboardKpis => {
  const counts = countProjectsByStatus(active); // 회차 포함 원본 건수(괄호 표기용)
  // 2026-08-27 수정: "프로젝트 건수"는 그룹(마스터+회차)을 각각 별도 건으로 세면 실제 프로젝트
  // 개수보다 부풀려짐 — 최상위(그룹이면 마스터, 아니면 자기 자신)만 1건으로 세고, 회차가 있는
  // 건은 화면에서 "N건(M회)" 형태로 회차 수를 별도 표기한다(dedupedCounts=건수, counts=회차 포함
  // 원본 총계, 화면에서 두 값을 비교해 회차가 있는지 판단).
  const dedupedActive = dedupedForCounting(active);
  const dedupedCounts = countProjectsByStatus(dedupedActive);
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
  // 편차: 예산비용이 비어있어 rateBase에서 제외된 매출(excludedRevenue)이 있으면, 그 프로젝트들이
  // "이익률 0%(비용=매출)"였을 때와 "이익률 100%(비용=0)"였을 때 사이에서 전체 이익률이 얼마나
  // 흔들릴 수 있는지를 ±로 표시한다. 제외된 매출이 없으면 편차 0(화면에서는 편차 자체를 숨김).
  const totalActiveRevenue = active.reduce((s, p) => s + eff(p), 0);
  const excludedRevenue = totalActiveRevenue - rateRevenue;
  let profitRateDeviation = 0;
  if (totalActiveRevenue > 0 && excludedRevenue > 0) {
    const worstRate = (rateProfit / totalActiveRevenue) * 100; // 미입력 매출 전부가 이익 0원이라 가정
    const bestRate = ((rateProfit + excludedRevenue) / totalActiveRevenue) * 100; // 미입력 매출 전부가 비용 0원(이익률 100%)이라 가정
    profitRateDeviation = Number(((bestRate - worstRate) / 2).toFixed(1));
  }
  return {
    total: dedupedActive.length,
    totalWithSessions: active.length,
    thisMonth: getThisMonthProjects(active).length,
    confirmedReady: dedupedCounts['확정/준비'],
    confirmedReadyWithSessions: counts['확정/준비'],
    inProgress: dedupedCounts['운영중'],
    inProgressWithSessions: counts['운영중'],
    reportSettlement: dedupedCounts['보고/정산'],
    reportSettlementWithSessions: counts['보고/정산'],
    paymentPending: getRequestedPayments(activePayments).length,
    paymentTarget: getUnrequestedPayments(activePayments).length,
    // 2026-08-25: 세금계산서/수금/정산은 매출 금액(effectiveAmount)과 달리 이중계상 방지 장치가
    // 없었음 — 회차형(recurring) 마스터는 실제 처리를 전부 하위 회차에서 하므로(마스터 자체
    // 항목은 UI에서도 숨김 처리됨), 이 세 카운트에서 마스터는 제외해야 회차 건과 중복 집계되지
    // 않는다. (매출분배(distribution) 마스터는 전 계열사 완료 시 자동으로 필드가 채워지는
    // 별도 메커니즘이 있어 정상 집계 대상으로 남겨둠.)
    taxInvoicePending: active.filter((p) => !isRecurringMaster(p) && !p.taxInvoiceIssued && p.revenueStatus !== '견적작성').length,
    unpaidCollection: active.filter((p) => !isRecurringMaster(p) && !p.collectionCompleted && p.taxInvoiceIssued).length,
    settlementPending: active.filter(
      (p) => !isRecurringMaster(p) && p.settlementStatus !== '결산완료' && p.settlementStatus !== '제외',
    ).length,
    confirmedRevenue,
    expectedRevenue,
    expectedProfit,
    profitRate,
    profitRateDeviation,
  };
};
