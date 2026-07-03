import type { PaymentStatus } from './project';

export interface PaymentRequest {
  id: string;
  projectId: string;
  projectName?: string;
  payeeType: '강사' | '업체' | '기타';
  payeeName: string;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  memo?: string;
  // 지급 절차 관련 (요청사항: 지급정보 확인 → 매입세금계산서 확인(업체) → 지급요청)
  payeeAccountInfo?: string;
  infoConfirmed?: boolean;
  vendorTaxInvoiceReceived?: boolean;
  vendorTaxInvoiceDate?: string;
  /** 지급완료 시 기록되는 지급월(YYYY-MM). 소급 처리를 위해 사용자가 선택 가능 */
  paidMonth?: string;
}

export interface SyncStatus {
  status: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
  syncedCount?: number;
  message?: string;
}
