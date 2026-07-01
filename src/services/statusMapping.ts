// =============================================================
// DB(Notion 원본 구조) ↔ 프론트엔드(4축 상태) 매핑
// DB는 Notion과 동일하게 "단일 진행상태 + 체크박스"로 저장하고,
// 프론트엔드 표시는 기존 4축(projectStatus/revenueStatus/paymentStatus/settlementStatus)을
// 이 매핑으로 파생시킨다. (설계 문서 "3자 연동" 결정사항 반영)
//
// ⚠️ 파생값이므로 완전한 1:1 역산은 불가능한 필드가 일부 있음(문서화됨).
// =============================================================
import type { ProjectStatus, RevenueStatus, PaymentStatus, SettlementStatus } from '../types';

export type DbProjectStatus =
  | '요청/담당' | '제안/PT' | '확정/준비' | '준비'
  | '운영/모니터링' | '보고/정산' | '종료(수익화완료)' | '취소/보류';

export const dbStatusToProjectStatus = (s: DbProjectStatus | string): ProjectStatus => {
  switch (s) {
    case '요청/담당':
    case '제안/PT': return '제안중';
    case '확정/준비':
    case '준비': return '확정/준비';
    case '운영/모니터링': return '운영중';
    case '보고/정산': return '보고/정산';
    case '종료(수익화완료)': return '완료';
    case '취소/보류': return '취소/보류';
    default: return '제안중';
  }
};

// 프론트에서 projectStatus를 바꿀 때 DB status로 되돌리는 매핑(대표값 1개 선택)
export const projectStatusToDbStatus = (s: ProjectStatus): DbProjectStatus => {
  switch (s) {
    case '제안중': return '제안/PT';
    case '제안완료': return '확정/준비'; // DB에 대응값 없음: 확정 단계로 승격 처리
    case '확정/준비': return '확정/준비';
    case '운영중': return '운영/모니터링';
    case '보고/정산': return '보고/정산';
    case '완료': return '종료(수익화완료)';
    case '취소/보류': return '취소/보류';
  }
};

export const deriveRevenueStatus = (row: {
  status: string; is_tax_invoice_issued: boolean; client_payment_received: boolean; final_estimate: number | null;
}): RevenueStatus => {
  if (row.status === '취소/보류') return '취소';
  if (row.is_tax_invoice_issued && row.client_payment_received) return '수금완료';
  if (row.is_tax_invoice_issued) return '수금대기';
  if (row.final_estimate && row.status !== '요청/담당' && row.status !== '제안/PT') return '계약확정';
  return '견적작성';
};

export const derivePaymentStatus = (costs: { status: string; is_payable: boolean }[]): PaymentStatus => {
  const payable = costs.filter((c) => c.is_payable);
  if (payable.length === 0) return costs.length === 0 ? '미등록' : '보류';
  if (payable.every((c) => c.status === '지급완료')) return '지급완료';
  if (payable.some((c) => c.status === '지급요청')) return '지급요청';
  if (payable.some((c) => c.status === '미지급')) return '지급대상';
  return '보류';
};

export const deriveSettlementStatus = (dbStatus: string): SettlementStatus => {
  switch (dbStatus) {
    case '종료(수익화완료)': return '결산완료';
    case '보고/정산': return '정산중';
    case '취소/보류': return '제외';
    default: return '미시작';
  }
};
