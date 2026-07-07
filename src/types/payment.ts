import type { PaymentStatus } from './project';

export interface PaymentRequest {
  id: string;
  projectId: string;
  projectName?: string;
  clientName?: string;
  /** 비용 세부내용 */
  detail?: string;
  /** 비용 유형 (강사비/대관비 등) */
  costType?: string;
  /** 카드결제 건 (이체 대상 아님 — 지급관리 제외, 예산탭 표시) */
  isCardPayment?: boolean;
  isPayable?: boolean;
  /** 세금 방식: rate33(기본 3.3%) | rate88(8.8%) | manual(용역비 수동/면제) */
  taxMode?: string;
  manualIncomeTax?: number;
  manualResidentTax?: number;
  payeeType: '강사' | '업체' | '기타';
  payeeName: string;
  amount: number;
  dueDate?: string;
  /** 지급 예약월 (YYYY-MM) — 해당 월 말일 일괄 지급 배치 대상 */
  scheduledMonth?: string;
  status: PaymentStatus;
  memo?: string;
  // 지급 절차 관련 (요청사항: 지급정보 확인 → 매입세금계산서 확인(업체) → 지급요청)
  payeeAccountInfo?: string;
  infoConfirmed?: boolean;
  vendorTaxInvoiceReceived?: boolean;
  vendorTaxInvoiceDate?: string;
  /** 지급완료 시 기록되는 지급월(YYYY-MM). 소급 처리를 위해 사용자가 선택 가능 */
  paidMonth?: string;
  // 지급 상세 확인·이체양식 다운로드용 (강사/업체 DB에서 조인)
  payeeId?: string;
  bankName?: string;
  accountNumber?: string;
  residentNumber?: string;   // 강사(개인)만 — 화면에는 마스킹 표시
  address?: string;
}

/** 프로젝트별 Notion 동기화 이력 (notion_sync_log) */
export interface ProjectSyncLog {
  id: string;
  direction: 'to_notion' | 'from_notion';
  status: 'success' | 'error';
  message: string;
  syncedAt: string;
}

export interface SyncStatus {
  status: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
  syncedCount?: number;
  message?: string;
}
