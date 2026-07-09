export type ClientType = '대기업' | '공공기관' | '교육대행사' | '중견기업' | '기타';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  memo?: string;
  // 세금계산서 발행일→고객사 입금일 평균 리드타임(일) — 과거 완료건 2건 이상일 때만 산출 (2026-07-09)
  avgPaymentLagDays?: number;
  paymentLagSampleCount?: number;
  paymentLagUpdatedAt?: string;
}
