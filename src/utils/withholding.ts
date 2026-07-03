// 개인(강사) 사업소득 원천징수 3.3% 계산
// - 소득세 3% (10원 미만 절사), 지방소득세 = 소득세의 10% (10원 미만 절사)
// - 구 그룹웨어(samsotta_management) PaymentConfirmation의 세율 체계를 이식
export interface Withholding {
  rate: number;        // 총 세율 (%)
  incomeTax: number;   // 소득세 (3%)
  residentTax: number; // 지방소득세 (0.3%)
  totalTax: number;    // 원천징수 합계
  netAmount: number;   // 실지급액
}

const floor10 = (v: number) => Math.floor(v / 10) * 10;

export function calcWithholding(grossAmount: number): Withholding {
  const gross = Number(grossAmount) || 0;
  const incomeTax = floor10(gross * 0.03);
  const residentTax = floor10(incomeTax * 0.1);
  const totalTax = incomeTax + residentTax;
  return { rate: 3.3, incomeTax, residentTax, totalTax, netAmount: gross - totalTax };
}

/** 주민등록번호 마스킹 (앞 6자리 + 뒷자리 첫 글자만 노출) */
export function maskResidentNumber(rrn?: string): string {
  if (!rrn) return '-';
  const clean = rrn.replace(/[^0-9]/g, '');
  if (clean.length < 7) return rrn;
  return `${clean.slice(0, 6)}-${clean.slice(6, 7)}******`;
}
