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
  /** DB 원본 상태 문자열 (상태 변경 UI용, 8종) */
  dbStatus?: string;
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
  /** 대표거래처 — 계열사 분산 계산서 발행 시 통계 집계용 (구 그룹웨어 확정 기능) */
  masterClientName?: string;
  /** 고객사 입금 메모 — 입금 지연 사유 등 (구 그룹웨어 확정 기능) */
  clientPaymentMemo?: string;
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
  // ─ 프로젝트 그룹(묶음) ─ 구 시스템 모델 이식: distribution(매출분배)/recurring(다회차)/merged(묶기)
  isMaster?: boolean;
  parentId?: string;            // 자식이면 마스터 id
  groupType?: 'distribution' | 'recurring' | 'merged';
  distributionRatio?: number;   // distribution 자식의 분배 비율(%)
  groupChildCount?: number;     // 마스터: 자식 수 (데이터 계층에서 계산)
  groupTotalAmount?: number;    // 마스터: 그룹 합계 금액 (데이터 계층에서 계산)
  effectiveAmount?: number;     // 통계용 유효 매출 — 자식이 금액을 가지면 마스터는 0 (이중계상 방지)
  finalEstimate?: number;       // DB final_estimate 원본(세전) — 그룹 자식 금액 수정용
  sourceType?: string;          // notion | legacy_public | manual_groupware
  supplyAmount: number;
  vat: number;
  totalAmount: number;
  collectionDueDate?: string;
  collectionDoneDate?: string;
  taxInvoiceDate?: string;
  revenueMonth?: string;
  vatType?: '포함' | '별도';

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
  /** 준비 체크 상태 (그룹웨어 전용 저장, 노션 미연동) */
  prepChecklist?: Record<string, boolean>;
  clientRequest?: string;
  internalMemo?: string;

  // 메타
  nextAction: string;
  riskFlags: string[];
  history: HistoryLog[];
  updatedAt: string;
}
