// 지급 관련 CSV 다운로드 유틸
// 구 그룹웨어(samsotta_management)의 '자금이체양식'/'사업소득지급내역' CSV 양식을 이식하고,
// 판관비 내역·통합 이체(프로젝트 지급 + 판관비) 양식을 추가했다. 민감정보 포함이므로 관리자 전용 화면에서만 호출할 것.
import type { PaymentRequest } from '../types';
import { calcWithholdingFor } from './withholding';
import { transferAmountFor, needsVatConfirm, calcVat } from './vat';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(fileName: string, headers: string[], rows: (string | number)[][]) {
  const bom = '\uFEFF';
  const content = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// 은행명 → 은행코드 (구 그룹웨어 확정 매핑 — 은행 CMS 대량이체 업로드용)
const BANK_CODES: Record<string, string> = {
  '하나': '081', '국민': '004', '신한': '088', '우리': '020', 'NH농협': '011', '농협': '011',
  'IBK기업': '003', '기업': '003', '카카오뱅크': '090', '케이뱅크': '089', '토스뱅크': '092',
  '새마을금고': '045', '신협': '048', '우체국': '071', 'SC제일': '023', '씨티': '027',
  '경남': '039', '광주': '034', '대구': '031', '부산': '032', '전북': '037', '제주': '035', '수협': '007',
};
const bankCode = (name?: string) => {
  if (!name) return '';
  const key = Object.keys(BANK_CODES).find((k) => name.includes(k));
  return key ? BANK_CODES[key] : name; // 미등록 은행은 원문 유지 (수기 확인용)
};

/**
 * 자금이체양식 — 실제 사용 중인 은행 업로드 서식에 맞춘 컬럼 구성 (2026-07-28, 첨부 양식 기준)
 * 은행 / 계좌번호 / 실지급액 / 지급처 / 대표자명 / 프로젝트명 / 비고
 *  - 은행: 코드가 아닌 은행명 그대로(양식 안내: "081" 또는 "하나" 모두 허용)
 *  - 실지급액: transferAmountFor — 강사는 원천징수 후 순액, 업체는 부가세 포함 총액
 *  - 대표자명: 업체는 대표자, 강사는 본인 이름
 */
export function downloadTransferSheet(requests: PaymentRequest[], label: string) {
  const headers = ['지급월', '은행', '계좌번호', '실지급액', '지급처', '대표자명', '프로젝트명', '비고'];
  // 계좌번호는 구분자(-) 없이 숫자만 — 은행 업로드 양식 안내 사항
  const digitsOnly = (v?: string) => (v ?? '').replace(/[^0-9]/g, '');
  // 지급월: 예약된 지급월 > 실제 지급월 > 다운로드 기준월 순으로 표기
  const payMonth = (r: PaymentRequest) => r.scheduledMonth || r.paidMonth || label;
  const rows = requests.map((r) => [
    payMonth(r),
    r.bankName ?? '',
    digitsOnly(r.accountNumber),
    transferAmountFor(r),
    r.payeeName,
    r.ceoName ?? r.payeeName,
    r.projectName ?? '',
    r.memo ?? '',
  ]);
  downloadCsv(`자금이체양식_${label}.csv`, headers, rows);
}

/** 사업소득지급내역: 강사(개인) 원천세 신고용 — '지급완료' + 지급월 일치 건 대상 */
export function downloadBusinessIncomeSheet(requests: PaymentRequest[], month: string) {
  const headers = ['귀속년월', '지급월', '지급일자', '소득자명', '주민등록번호', '주소', '지급총액', '세율(%)', '소득세', '지방소득세', '실지급액', '프로젝트'];
  const rows = requests
    .filter((r) => r.payeeType === '강사')
    .map((r) => {
      const w = calcWithholdingFor(r);
      return [
        month, r.paidMonth ?? month, r.paidDate ?? '', r.payeeName, r.residentNumber ?? '', r.address ?? '',
        r.amount, w.rate, w.incomeTax, w.residentTax, w.netAmount, r.projectName ?? '',
      ];
    });
  downloadCsv(`사업소득지급내역_${month}.csv`, headers, rows);
}

export interface SgaRow {
  transaction_date: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
}

/** 판관비 내역 다운로드 */
export function downloadSgaSheet(rows: SgaRow[], label: string) {
  const headers = ['일자', '분류', '내용', '금액', '상태'];
  downloadCsv(`판관비내역_${label}.csv`, headers,
    rows.map((r) => [r.transaction_date, r.category, r.description ?? '', r.amount, r.status === 'paid' ? '지급완료' : '대기']));
}

/** 통합 이체 내역: 지급요청(프로젝트) + 미지급 판관비를 은행 이체 계획용으로 통합 (관리자 전용) */
export function downloadCombinedTransferSheet(requests: PaymentRequest[], sga: SgaRow[], label: string) {
  const headers = ['구분', '지급처', '은행명', '계좌번호', '실지급액', '내용/프로젝트'];
  // 실지급액은 transferAmountFor로 통일 (강사=원천징수 후, 업체=부가세 포함 총액)
  const projectRows: (string | number)[][] = requests.map((r) => [
    '프로젝트 지급', r.payeeName, r.bankName ?? '', r.accountNumber ?? '', transferAmountFor(r), r.projectName ?? '',
  ]);
  const sgaRows: (string | number)[][] = sga.map((r) => [
    '판관비', r.category, '', '', r.amount, r.description ?? '',
  ]);
  const total = [...projectRows, ...sgaRows].reduce((s, row) => s + Number(row[4] || 0), 0);
  downloadCsv(`통합이체내역_${label}.csv`, headers, [...projectRows, ...sgaRows, ['합계', '', '', '', total, '']]);
}


/** 이체 전 검증 요약 — 다운로드 직전 사용자에게 보여줄 합계와 미확인 건수 */
export function transferSummary(requests: PaymentRequest[]) {
  const unconfirmed = requests.filter(needsVatConfirm);
  let supply = 0, vat = 0, total = 0;
  for (const r of requests) {
    if (r.payeeType === '업체') {
      const b = calcVat(r.amount, r.vatMode);
      supply += b.supply; vat += b.vat; total += b.total;
    } else {
      const t = transferAmountFor(r);
      supply += t; total += t;
    }
  }
  return { count: requests.length, supply, vat, total, unconfirmed };
}
