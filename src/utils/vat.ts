// 업체 지급건의 부가세 계산 및 실제 이체금액 산출 (2026-07-28)
//
// 배경: 예산/비용에 입력하는 업체 금액은 관행상 '공급가액(부가세 별도)'인 경우가 대부분이다
// (과거 이관분 대조 결과 과세건 193건 중 183건). 그런데 자금이체양식은 입력값을 그대로 이체액으로 써서
// 부가세만큼 적게 이체되는 문제가 있었다. 여기서 지급총액을 한 곳에서 계산해 화면·다운로드가 같은 값을 쓰게 한다.
import type { PaymentRequest } from '../types';
import { calcWithholdingFor } from './withholding';

export type VatMode = 'exclusive' | 'inclusive' | 'exempt';

export const VAT_RATE = 0.1;

export const VAT_MODE_LABEL: Record<VatMode, string> = {
  exclusive: '부가세 별도',
  inclusive: '부가세 포함',
  exempt: '면세',
};

export interface VatBreakdown {
  mode: VatMode | null;   // null = 미확인
  supply: number;         // 공급가액
  vat: number;            // 부가세
  total: number;          // 지급총액(실제 이체액)
  confirmed: boolean;     // 부가세 구분이 확정되었는지
}

/** 업체 지급건의 공급가액/부가세/지급총액 계산 */
export function calcVat(amount: number, mode: VatMode | null | undefined): VatBreakdown {
  const base = Number(amount) || 0;
  if (mode === 'exclusive') {
    const vat = Math.round(base * VAT_RATE);
    return { mode, supply: base, vat, total: base + vat, confirmed: true };
  }
  if (mode === 'inclusive') {
    // 입력액이 총액 — 공급가액은 역산(표시용)
    const supply = Math.round(base / (1 + VAT_RATE));
    return { mode, supply, vat: base - supply, total: base, confirmed: true };
  }
  if (mode === 'exempt') {
    return { mode, supply: base, vat: 0, total: base, confirmed: true };
  }
  // 미확인: 부가세를 임의로 더하지 않는다(과다 이체 방지). 화면에서 확인을 유도한다.
  return { mode: null, supply: base, vat: 0, total: base, confirmed: false };
}

/** 업체 건 여부 */
export const isVendorRequest = (r: Pick<PaymentRequest, 'payeeType'>) => r.payeeType === '업체';

/**
 * 실제 이체할 금액 — 강사는 원천징수 후 순액, 업체는 부가세 포함 총액, 그 외는 금액 그대로.
 * 자금이체양식과 화면 표기가 항상 같은 값을 쓰도록 이 함수를 단일 창구로 사용한다.
 */
export function transferAmountFor(r: PaymentRequest): number {
  if (r.payeeType === '강사') return calcWithholdingFor(r).netAmount;
  if (isVendorRequest(r)) return calcVat(r.amount, r.vatMode).total;
  return Number(r.amount) || 0;
}

/** 부가세 구분이 확인되지 않은 업체 건인지 — 이체 전 확인이 필요한 상태 */
export function needsVatConfirm(r: PaymentRequest): boolean {
  return isVendorRequest(r) && !r.vatMode;
}

/** 업체의 과세유형(과세/면세)으로 기본 부가세 구분을 추천 */
export function defaultVatMode(companyTaxType?: string | null): VatMode {
  return companyTaxType === '면세' ? 'exempt' : 'exclusive';
}
