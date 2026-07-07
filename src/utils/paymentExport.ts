// 지급 관련 CSV 다운로드 유틸
// 구 그룹웨어(samsotta_management)의 '자금이체양식'/'사업소득지급내역' CSV 양식을 이식하고,
// 판관비 내역·통합 이체(프로젝트 지급 + 판관비) 양식을 추가했다. 민감정보 포함이므로 관리자 전용 화면에서만 호출할 것.
import type { PaymentRequest } from '../types';
import { calcWithholdingFor, calcWithholding } from './withholding';

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

/** 자금이체양식: 은행 CMS 대량이체 업로드용 — 구 그룹웨어 확정 양식 (지급요청 상태 건 대상) */
export function downloadTransferSheet(requests: PaymentRequest[], label: string) {
  const headers = ['입금은행', '입금계좌번호', '입금액(원)', '출금통장표시', '입금통장표시', 'CMS코드'];
  const mark = (r: PaymentRequest) => (r.projectName || r.payeeName).slice(0, 20); // 통장표시 최대 20자
  const rows = requests.map((r) => {
    const w = calcWithholdingFor(r);
    return [bankCode(r.bankName), r.accountNumber ?? '', w.netAmount, mark(r), mark(r), ''];
  });
  downloadCsv(`자금이체양식_${label}.csv`, headers, rows);
}

/** 사업소득지급내역: 강사(개인) 원천세 신고용 — '지급완료' + 지급월 일치 건 대상 */
export function downloadBusinessIncomeSheet(requests: PaymentRequest[], month: string) {
  const headers = ['귀속년월', '지급월', '소득자명', '주민등록번호', '주소', '지급총액', '세율(%)', '소득세', '지방소득세', '실지급액', '프로젝트'];
  const rows = requests
    .filter((r) => r.payeeType === '강사')
    .map((r) => {
      const w = calcWithholdingFor(r);
      return [
        month, r.paidMonth ?? month, r.payeeName, r.residentNumber ?? '', r.address ?? '',
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
  const projectRows: (string | number)[][] = requests.map((r) => {
    const net = calcWithholdingFor(r).netAmount;
    return ['프로젝트 지급', r.payeeName, r.bankName ?? '', r.accountNumber ?? '', net, r.projectName ?? ''];
  });
  const sgaRows: (string | number)[][] = sga.map((r) => [
    '판관비', r.category, '', '', r.amount, r.description ?? '',
  ]);
  const total = [...projectRows, ...sgaRows].reduce((s, row) => s + Number(row[4] || 0), 0);
  downloadCsv(`통합이체내역_${label}.csv`, headers, [...projectRows, ...sgaRows, ['합계', '', '', '', total, '']]);
}
