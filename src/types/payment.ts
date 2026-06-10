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
}

export interface SyncStatus {
  status: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
  syncedCount?: number;
  message?: string;
}
