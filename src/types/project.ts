// 프로젝트 4축 상태 체계 (사양서 7장)
export type ProjectStatus =
  | '제안중'
  | '제안완료'
  | '확정/준비'
  | '운영중'
  | '보고/정산'
  | '완료'
  | '취소/보류';

export type RevenueStatus =
  | '견적작성'
  | '계약확정'
  | '세금계산서 발행대기'
  | '세금계산서 발행완료'
  | '수금대기'
  | '수금완료'
  | '취소';

export type PaymentStatus =
  | '미등록'
  | '지급대상'
  | '지급요청'
  | '지급완료'
  | '보류';

export type SettlementStatus =
  | '미시작'
  | '자료수집'
  | '정산중'
  | '검토필요'
  | '결산완료'
  | '제외';

export type Priority = '높음' | '중간' | '낮음';

// 업무 준비 체크리스트 (사양서 8.6)
export interface PrepItem {
  id: string;
  label: string;
  category: '강사' | '교재' | '교구재' | '제작물' | '정산' | '운영' | '보고';
  completed: boolean;
  dueDate?: string;
}

// 히스토리 로그 (탭 7)
export interface HistoryLog {
  id: string;
  at: string;
  type: '상태변경' | '메모' | '시스템';
  message: string;
  actor?: string;
}

// 노션 연동 대비 필드 (사양서 12장)
export interface NotionSyncFields {
  notionPageId?: string;
  notionUrl?: string;
  lastSyncedAt?: string;
  syncStatus?: 'synced' | 'pending' | 'error';
  syncError?: string;
}

export interface Project extends NotionSyncFields {
  id: string;
  projectName: string;
  clientId: string;
  clientName: string;
  courseName: string;
  topic: string;
  description: string;
  startDate: string;
  endDate?: string;
  proposalDueDate?: string;
  proposalSubmittedDate?: string;
  managerName: string;
  priority: Priority;

  // 4축 상태
  projectStatus: ProjectStatus;
  revenueStatus: RevenueStatus;
  paymentStatus: PaymentStatus;
  settlementStatus: SettlementStatus;

  // 매출
  initialEstimate: number;
  contractAmount: number;
  supplyAmount: number;
  vat: number;
  totalAmount: number;
  collectionDueDate?: string;
  collectionDoneDate?: string;
  taxInvoiceDate?: string;
  revenueMonth?: string;

  // 예산/비용
  trainerFeeBudget: number;
  operationBudget: number;
  materialBudget: number;
  productionBudget: number;
  etcCost: number;
  expectedCost: number;
  actualCost: number;
  expectedProfit: number;
  profitRate: number;

  // 진행 플래그
  taxInvoiceIssued: boolean;
  statementSubmitted: boolean;
  proposalSubmitted: boolean;
  reportCompleted: boolean;
  paymentRequested: boolean;
  paymentCompleted: boolean;
  collectionCompleted: boolean;

  // 운영
  trainerIds: string[];
  vendorIds: string[];
  prepItems: PrepItem[];
  clientRequest?: string;
  internalMemo?: string;

  // 메타
  nextAction: string;
  riskFlags: string[];
  history: HistoryLog[];
  updatedAt: string;
}
