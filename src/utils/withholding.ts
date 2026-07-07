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

/** 요청별 원천징수 계산 — 지급 상세에서 선택한 세금 방식(taxMode) 반영 (구 그룹웨어 이식)
 *  rate33: 소득세 3% + 주민세 0.3% / rate88: 8% + 0.8% / manual: 용역비 등 수동·면제 */
export function calcWithholdingFor(req: { payeeType?: string; amount: number; taxMode?: string; manualIncomeTax?: number; manualResidentTax?: number }): Withholding {
  const gross = Number(req.amount) || 0;
  if (req.payeeType !== '강사') return { rate: 0, incomeTax: 0, residentTax: 0, totalTax: 0, netAmount: gross };
  if (req.taxMode === 'manual') {
    const incomeTax = Number(req.manualIncomeTax) || 0;
    const residentTax = Number(req.manualResidentTax) || 0;
    return { rate: 0, incomeTax, residentTax, totalTax: incomeTax + residentTax, netAmount: gross - incomeTax - residentTax };
  }
  const pct = req.taxMode === 'rate88' ? 0.08 : 0.03;
  const incomeTax = floor10(gross * pct);
  const residentTax = floor10(incomeTax * 0.1);
  const totalTax = incomeTax + residentTax;
  return { rate: req.taxMode === 'rate88' ? 8.8 : 3.3, incomeTax, residentTax, totalTax, netAmount: gross - totalTax };
}
