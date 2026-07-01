import type { Project, PrepItem, HistoryLog } from '../types';
import { calculateSupplyAmount, calculateProfit, calculateProfitRate } from '../utils/calculations';

// prep item 헬퍼
let piSeq = 0;
const pi = (
  label: string,
  category: PrepItem['category'],
  completed: boolean,
  dueDate?: string,
): PrepItem => ({ id: `pi-${++piSeq}`, label, category, completed, dueDate });

let hSeq = 0;
const h = (at: string, type: HistoryLog['type'], message: string, actor = '시스템'): HistoryLog =>
  ({ id: `h-${++hSeq}`, at, type, message, actor });

interface Seed {
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
  priority: Project['priority'];
  projectStatus: Project['projectStatus'];
  revenueStatus: Project['revenueStatus'];
  paymentStatus: Project['paymentStatus'];
  settlementStatus: Project['settlementStatus'];
  contractAmount: number;
  initialEstimate?: number;
  trainerFeeBudget: number;
  operationBudget: number;
  materialBudget: number;
  productionBudget: number;
  etcCost: number;
  actualCost?: number;
  taxInvoiceIssued?: boolean;
  statementSubmitted?: boolean;
  reportCompleted?: boolean;
  paymentRequested?: boolean;
  paymentCompleted?: boolean;
  collectionCompleted?: boolean;
  collectionDueDate?: string;
  collectionDoneDate?: string;
  trainerIds: string[];
  vendorIds?: string[];
  prepItems: PrepItem[];
  clientRequest?: string;
  internalMemo?: string;
  nextAction: string;
  riskFlags: string[];
  history?: HistoryLog[];
  updatedAt: string;
}

const make = (s: Seed): Project => {
  const totalAmount = s.contractAmount;
  const supplyAmount = calculateSupplyAmount(totalAmount);
  const vat = totalAmount - supplyAmount;
  const expectedCost =
    s.trainerFeeBudget + s.operationBudget + s.materialBudget + s.productionBudget + s.etcCost;
  const actualCost = s.actualCost ?? 0;
  const costForProfit = actualCost > 0 ? actualCost : expectedCost;
  const expectedProfit = calculateProfit(totalAmount, costForProfit);
  const profitRate = calculateProfitRate(expectedProfit, totalAmount);
  return {
    notionPageId: `notion-${s.id}`,
    notionUrl: `https://www.notion.so/samsotta/${s.id}`,
    lastSyncedAt: '2026-06-05T08:00:00+09:00',
    syncStatus: 'synced',
    initialEstimate: s.initialEstimate ?? totalAmount,
    supplyAmount,
    vat,
    totalAmount,
    expectedCost,
    actualCost,
    expectedProfit,
    profitRate,
    taxInvoiceIssued: s.taxInvoiceIssued ?? false,
    statementSubmitted: s.statementSubmitted ?? false,
    proposalSubmitted: true,
    reportCompleted: s.reportCompleted ?? false,
    paymentRequested: s.paymentRequested ?? false,
    paymentCompleted: s.paymentCompleted ?? false,
    collectionCompleted: s.collectionCompleted ?? false,
    vendorIds: s.vendorIds ?? [],
    clientRequest: s.clientRequest,
    internalMemo: s.internalMemo,
    history: s.history ?? [h(s.updatedAt, '시스템', '노션에서 동기화됨')],
    ...s,
  };
};

export const sampleProjects: Project[] = [
  make({
    id: 'pj-001', projectName: '[태림페이퍼] 2026 중간관리자 교육', clientId: 'cl-taerim', clientName: '태림페이퍼',
    courseName: '중간관리자 리더십 과정', topic: '리더십/조직개발', description: '중간관리자 대상 2일 집합교육. 1차수 운영.',
    startDate: '2026-06-12', endDate: '2026-06-13', managerName: '김삼소', priority: '높음',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 22000000, trainerFeeBudget: 6000000, operationBudget: 2000000, materialBudget: 1500000, productionBudget: 800000, etcCost: 500000,
    trainerIds: [], collectionDueDate: '2026-07-31',
    prepItems: [pi('1차수 운영자 섭외', '운영', false, '2026-06-08'), pi('교재 인쇄', '교재', false), pi('명찰 준비', '제작물', false)],
    nextAction: '1차수 운영자 섭외 필요', riskFlags: ['교육일 7일 이내 강사 미확정'],
    internalMemo: '강사 후보 김도현/박준영 조율 중', updatedAt: '2026-06-04T17:00:00+09:00',
  }),
  make({
    id: 'pj-002', projectName: '[유밥] 한국특허기술진흥원 승진자 과정', clientId: 'cl-yubob', clientName: '유밥',
    courseName: '승진자 리더십 과정', topic: '리더십', description: '특허기술진흥원 승진예정자 대상 위탁교육(유밥 대행).',
    startDate: '2026-05-20', endDate: '2026-05-21', managerName: '이소따', priority: '중간',
    projectStatus: '보고/정산', revenueStatus: '세금계산서 발행완료', paymentStatus: '지급요청', settlementStatus: '정산중',
    contractAmount: 18700000, trainerFeeBudget: 5000000, operationBudget: 1500000, materialBudget: 1000000, productionBudget: 400000, etcCost: 300000,
    actualCost: 8100000, taxInvoiceIssued: true, reportCompleted: true, paymentRequested: true, statementSubmitted: false,
    trainerIds: ['in-kim'], collectionDueDate: '2026-06-30',
    prepItems: [pi('보고서 작성', '보고', true), pi('거래명세서 발송', '정산', false, '2026-06-10')],
    nextAction: '거래명세서 발송 확인', riskFlags: ['거래명세서 미제출'],
    updatedAt: '2026-06-03T11:00:00+09:00',
  }),
  make({
    id: 'pj-003', projectName: '[유밥] 제이브이엠 전사워크숍', clientId: 'cl-yubob', clientName: '유밥',
    courseName: '전사 조직활성화 워크숍', topic: '팀빌딩', description: '제이브이엠 전 직원 대상 1일 워크숍.',
    startDate: '2026-06-25', managerName: '이소따', priority: '중간',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 13200000, trainerFeeBudget: 3500000, operationBudget: 1200000, materialBudget: 600000, productionBudget: 500000, etcCost: 200000,
    trainerIds: ['in-park', 'in-bae'], collectionDueDate: '2026-07-31',
    prepItems: [pi('퍼실리테이터 2인 확정', '강사', true), pi('교구재 발주', '교구재', false, '2026-06-18')],
    nextAction: '교구재 발주', riskFlags: [], updatedAt: '2026-06-02T15:00:00+09:00',
  }),
  make({
    id: 'pj-004', projectName: '[디토닉] 전사교육 로드맵', clientId: 'cl-ditonic', clientName: '디토닉',
    courseName: '연간 교육 로드맵 컨설팅', topic: 'HRD 컨설팅', description: '연간 교육체계 수립 컨설팅 프로젝트.',
    startDate: '2026-07-06', endDate: '2026-08-29', proposalDueDate: '2026-06-15', managerName: '김삼소', priority: '높음',
    projectStatus: '제안완료', revenueStatus: '견적작성', paymentStatus: '미등록', settlementStatus: '미시작',
    contractAmount: 33000000, initialEstimate: 35000000, trainerFeeBudget: 8000000, operationBudget: 3000000, materialBudget: 1000000, productionBudget: 1000000, etcCost: 2000000,
    proposalSubmittedDate: '2026-06-01', trainerIds: ['in-yoon'],
    prepItems: [pi('제안서 제출', '운영', true), pi('계약 협의', '운영', false)],
    nextAction: '계약 협의 진행', riskFlags: [], updatedAt: '2026-06-01T09:30:00+09:00',
  }),
  make({
    id: 'pj-005', projectName: '[GS칼텍스] 영업 시니어 노하우 워크숍', clientId: 'cl-gscaltex', clientName: 'GS칼텍스',
    courseName: '영업 시니어 노하우 전수 워크숍', topic: '영업/세일즈', description: '시니어 영업인력 노하우 공유 워크숍.',
    startDate: '2026-06-18', managerName: '이소따', priority: '중간',
    projectStatus: '운영중', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 16500000, trainerFeeBudget: 4500000, operationBudget: 1300000, materialBudget: 900000, productionBudget: 300000, etcCost: 200000,
    trainerIds: ['in-jung'], collectionDueDate: '2026-07-31',
    prepItems: [pi('강사 확정', '강사', true), pi('교재 최종본 업로드', '교재', false, '2026-06-15')],
    nextAction: '교재 최종본 업로드', riskFlags: ['운영중 교재 미완료'], updatedAt: '2026-06-04T13:00:00+09:00',
  }),
  make({
    id: 'pj-006', projectName: '[넥센타이어] SHADOW TRACE 팀빌딩', clientId: 'cl-nexen', clientName: '넥센타이어',
    courseName: 'SHADOW TRACE 추리형 팀빌딩', topic: '팀빌딩', description: '추리게임 기반 팀빌딩 프로그램.',
    startDate: '2026-05-09', managerName: '김삼소', priority: '중간',
    projectStatus: '보고/정산', revenueStatus: '세금계산서 발행완료', paymentStatus: '지급요청', settlementStatus: '검토필요',
    contractAmount: 14300000, trainerFeeBudget: 3000000, operationBudget: 2500000, materialBudget: 500000, productionBudget: 2000000, etcCost: 300000,
    actualCost: 8300000, taxInvoiceIssued: true, reportCompleted: true, statementSubmitted: true, paymentRequested: true,
    trainerIds: ['in-park'], vendorIds: ['vd-prop'], collectionDueDate: '2026-06-20',
    prepItems: [pi('제작물(소품) 발주', '제작물', true), pi('강사료 지급요청', '정산', true), pi('업체 지급요청', '정산', false)],
    nextAction: '강사료 지급요청 대기', riskFlags: ['지급요청 대기'], updatedAt: '2026-06-03T16:30:00+09:00',
  }),
  make({
    id: 'pj-007', projectName: '[강원공무원교육원] 신입공무원 생성형 AI 과정', clientId: 'cl-gwedu', clientName: '강원공무원교육원',
    courseName: '신입공무원 생성형 AI 활용', topic: '생성형AI', description: '신입 공무원 대상 생성형 AI 실습 과정.',
    startDate: '2026-06-23', endDate: '2026-06-24', managerName: '이소따', priority: '높음',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 19800000, trainerFeeBudget: 5400000, operationBudget: 1500000, materialBudget: 1200000, productionBudget: 400000, etcCost: 300000,
    trainerIds: ['in-lee'], collectionDueDate: '2026-07-31',
    prepItems: [pi('강사 확정', '강사', true), pi('교재 최종본 업로드', '교재', false, '2026-06-16'), pi('실습환경 점검', '운영', false)],
    nextAction: '교재 최종본 업로드 필요', riskFlags: [], updatedAt: '2026-06-04T10:00:00+09:00',
  }),
  make({
    id: 'pj-008', projectName: '[인천경찰청] 경감 리더십 과정', clientId: 'cl-icpolice', clientName: '인천경찰청',
    courseName: '경감 승진자 리더십', topic: '리더십', description: '경감 승진자 대상 리더십 교육.',
    startDate: '2026-07-14', proposalDueDate: '2026-06-20', managerName: '김삼소', priority: '중간',
    projectStatus: '제안중', revenueStatus: '견적작성', paymentStatus: '미등록', settlementStatus: '미시작',
    contractAmount: 12100000, trainerFeeBudget: 3200000, operationBudget: 1000000, materialBudget: 700000, productionBudget: 200000, etcCost: 200000,
    trainerIds: [],
    prepItems: [pi('제안서 작성', '운영', false, '2026-06-19')],
    nextAction: '제안서 제출 (마감 임박)', riskFlags: ['제안 마감일 임박'], updatedAt: '2026-06-05T08:30:00+09:00',
  }),
  make({
    id: 'pj-009', projectName: '[KHNP] 교수진 AI 웹앱 실습 과정', clientId: 'cl-khnp', clientName: '한국수력원자력',
    courseName: '교수진 AI 웹앱 빌더 실습', topic: 'AI웹앱', description: '사내 교수진 대상 노코드 AI 웹앱 제작 실습.',
    startDate: '2026-06-30', endDate: '2026-07-01', managerName: '이소따', priority: '높음',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 24200000, trainerFeeBudget: 7000000, operationBudget: 2000000, materialBudget: 1000000, productionBudget: 500000, etcCost: 500000,
    trainerIds: ['in-song'], collectionDueDate: '2026-08-15',
    prepItems: [pi('실습 계정 발급', '운영', false), pi('교재 제작', '교재', true)],
    nextAction: '실습 계정 발급 요청', riskFlags: [], updatedAt: '2026-06-03T14:00:00+09:00',
  }),
  make({
    id: 'pj-010', projectName: '[서울대] 임원 리더십 특강', clientId: 'cl-snu', clientName: '서울대학교',
    courseName: '임원 대상 리더십 특강', topic: '리더십', description: '단발성 임원 특강 2시간.',
    startDate: '2026-04-18', managerName: '김삼소', priority: '낮음',
    projectStatus: '완료', revenueStatus: '수금완료', paymentStatus: '지급완료', settlementStatus: '결산완료',
    contractAmount: 5500000, trainerFeeBudget: 2000000, operationBudget: 300000, materialBudget: 100000, productionBudget: 0, etcCost: 100000,
    actualCost: 2400000, taxInvoiceIssued: true, statementSubmitted: true, reportCompleted: true, paymentRequested: true, paymentCompleted: true, collectionCompleted: true,
    collectionDueDate: '2026-05-18', collectionDoneDate: '2026-05-15',
    trainerIds: ['in-kang'],
    prepItems: [pi('특강 자료', '교재', true), pi('결산', '정산', true)],
    nextAction: '완료', riskFlags: [], updatedAt: '2026-05-16T09:00:00+09:00',
  }),
  make({
    id: 'pj-011', projectName: '[삼성전자] 파트장 조직활성화 과정', clientId: 'cl-samsung', clientName: '삼성전자',
    courseName: '파트장 조직활성화', topic: '조직개발', description: '파트장 대상 조직활성화 3회차 과정.',
    startDate: '2026-06-05', endDate: '2026-06-19', managerName: '이소따', priority: '높음',
    projectStatus: '운영중', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 38500000, trainerFeeBudget: 12000000, operationBudget: 3000000, materialBudget: 2000000, productionBudget: 1000000, etcCost: 1000000,
    trainerIds: ['in-kim', 'in-yoon'], collectionDueDate: '2026-08-31',
    prepItems: [pi('1회차 운영', '운영', true), pi('2회차 운영', '운영', false), pi('3회차 운영', '운영', false)],
    nextAction: '2회차 운영 준비', riskFlags: [], updatedAt: '2026-06-05T07:30:00+09:00',
  }),
  make({
    id: 'pj-012', projectName: '[한솔] 리더십 진단 워크숍', clientId: 'cl-hansol', clientName: '한솔',
    courseName: '리더십 진단 기반 워크숍', topic: '리더십진단', description: '진단 도구 활용 리더십 워크숍.',
    startDate: '2026-05-28', managerName: '김삼소', priority: '중간',
    projectStatus: '보고/정산', revenueStatus: '세금계산서 발행대기', paymentStatus: '지급요청', settlementStatus: '자료수집',
    contractAmount: 9900000, trainerFeeBudget: 2800000, operationBudget: 900000, materialBudget: 600000, productionBudget: 200000, etcCost: 100000,
    actualCost: 4600000, reportCompleted: true, statementSubmitted: true, paymentRequested: true,
    trainerIds: ['in-kang'], collectionDueDate: '2026-06-30',
    prepItems: [pi('보고서', '보고', true), pi('세금계산서 발행', '정산', false, '2026-06-09')],
    nextAction: '세금계산서 발행', riskFlags: ['세금계산서 미발행'], updatedAt: '2026-06-02T17:30:00+09:00',
  }),
  make({
    id: 'pj-013', projectName: '[한국은행] 현장탐방 프로그램', clientId: 'cl-bok', clientName: '한국은행',
    courseName: '신입 현장탐방 프로그램', topic: '온보딩', description: '신입직원 현장탐방형 교육.',
    startDate: '2026-07-21', proposalDueDate: '2026-06-28', managerName: '이소따', priority: '낮음',
    projectStatus: '제안중', revenueStatus: '견적작성', paymentStatus: '미등록', settlementStatus: '미시작',
    contractAmount: 8800000, trainerFeeBudget: 2400000, operationBudget: 1500000, materialBudget: 300000, productionBudget: 200000, etcCost: 400000,
    trainerIds: [],
    prepItems: [pi('견적 작성', '운영', false)],
    nextAction: '견적 작성', riskFlags: [], updatedAt: '2026-05-30T10:00:00+09:00',
  }),
  make({
    id: 'pj-014', projectName: '[영상물등급위원회] 교육훈련 과정', clientId: 'cl-kmrb', clientName: '영상물등급위원회',
    courseName: '직원 역량강화 교육훈련', topic: '직무역량', description: '직원 대상 직무 교육.',
    startDate: '2026-05-15', managerName: '김삼소', priority: '낮음',
    projectStatus: '보고/정산', revenueStatus: '수금대기', paymentStatus: '지급완료', settlementStatus: '검토필요',
    contractAmount: 7700000, trainerFeeBudget: 2200000, operationBudget: 700000, materialBudget: 400000, productionBudget: 100000, etcCost: 100000,
    actualCost: 3500000, taxInvoiceIssued: true, statementSubmitted: true, reportCompleted: true, paymentRequested: true, paymentCompleted: true,
    collectionDueDate: '2026-05-31',
    trainerIds: ['in-han'],
    prepItems: [pi('보고서', '보고', true), pi('수금 확인', '정산', false)],
    nextAction: '수금 확인 (수금 지연)', riskFlags: ['수금 지연'], updatedAt: '2026-06-01T12:00:00+09:00',
  }),
  make({
    id: 'pj-015', projectName: '[한국사학진흥재단] 조직문화 워크숍', clientId: 'cl-kasfo', clientName: '한국사학진흥재단',
    courseName: '조직문화 개선 워크숍', topic: '조직문화', description: '조직문화 진단 및 개선 워크숍.',
    startDate: '2026-06-11', managerName: '이소따', priority: '중간',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 11000000, trainerFeeBudget: 3000000, operationBudget: 1000000, materialBudget: 600000, productionBudget: 300000, etcCost: 100000,
    trainerIds: ['in-yoon'], collectionDueDate: '2026-07-31',
    prepItems: [pi('강사 확정', '강사', true), pi('워크북 제작', '교재', false)],
    nextAction: '워크북 제작', riskFlags: [], updatedAt: '2026-06-03T09:00:00+09:00',
  }),
  make({
    id: 'pj-016', projectName: '[경기도시장상권진흥원] 전사 워크숍', clientId: 'cl-gmr', clientName: '경기도시장상권진흥원',
    courseName: '전사 비전공유 워크숍', topic: '팀빌딩', description: '전 직원 비전공유 워크숍.',
    startDate: '2026-08-05', proposalDueDate: '2026-07-10', managerName: '김삼소', priority: '낮음',
    projectStatus: '제안완료', revenueStatus: '견적작성', paymentStatus: '미등록', settlementStatus: '미시작',
    contractAmount: 9900000, trainerFeeBudget: 2600000, operationBudget: 1200000, materialBudget: 400000, productionBudget: 300000, etcCost: 200000,
    proposalSubmittedDate: '2026-06-02', trainerIds: ['in-bae'],
    prepItems: [pi('제안서 제출', '운영', true)],
    nextAction: '선정 결과 대기', riskFlags: [], updatedAt: '2026-06-02T16:00:00+09:00',
  }),
  make({
    id: 'pj-017', projectName: '[인천대학교] 교직원 회복탄력성 교육', clientId: 'cl-inu', clientName: '인천대학교',
    courseName: '교직원 회복탄력성', topic: '회복탄력성', description: '교직원 대상 회복탄력성 교육.',
    startDate: '2026-06-27', managerName: '이소따', priority: '중간',
    projectStatus: '확정/준비', revenueStatus: '계약확정', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 8800000, trainerFeeBudget: 2400000, operationBudget: 800000, materialBudget: 500000, productionBudget: 100000, etcCost: 100000,
    trainerIds: [], collectionDueDate: '2026-07-31',
    prepItems: [pi('강사 섭외', '강사', false, '2026-06-20')],
    nextAction: '강사 섭외 필요', riskFlags: ['교육일 7일 이내 강사 미확정'], updatedAt: '2026-06-04T18:00:00+09:00',
  }),
  make({
    id: 'pj-018', projectName: '[L&F] 리더십 전환 워크숍', clientId: 'cl-lnf', clientName: 'L&F',
    courseName: '신임 리더 전환 워크숍', topic: '리더십', description: '신임 리더 대상 전환 워크숍.',
    startDate: '2026-05-02', managerName: '김삼소', priority: '중간',
    projectStatus: '완료', revenueStatus: '수금완료', paymentStatus: '지급완료', settlementStatus: '결산완료',
    contractAmount: 13200000, trainerFeeBudget: 3600000, operationBudget: 1100000, materialBudget: 700000, productionBudget: 300000, etcCost: 200000,
    actualCost: 5900000, taxInvoiceIssued: true, statementSubmitted: true, reportCompleted: true, paymentRequested: true, paymentCompleted: true, collectionCompleted: true,
    collectionDueDate: '2026-05-31', collectionDoneDate: '2026-05-29',
    trainerIds: ['in-kim'],
    prepItems: [pi('결산', '정산', true)],
    nextAction: '완료', riskFlags: [], updatedAt: '2026-05-30T11:00:00+09:00',
  }),
  make({
    id: 'pj-019', projectName: '[디토닉] 핵심가치 내재화 워크숍', clientId: 'cl-ditonic', clientName: '디토닉',
    courseName: '핵심가치 내재화', topic: '핵심가치', description: '핵심가치 내재화 단발 워크숍 (보류).',
    startDate: '2026-07-01', managerName: '이소따', priority: '낮음',
    projectStatus: '취소/보류', revenueStatus: '취소', paymentStatus: '보류', settlementStatus: '제외',
    contractAmount: 6600000, initialEstimate: 6600000, trainerFeeBudget: 1800000, operationBudget: 600000, materialBudget: 300000, productionBudget: 100000, etcCost: 100000,
    trainerIds: [],
    prepItems: [pi('견적', '운영', true)],
    nextAction: '보류 (내부 일정 조정)', riskFlags: [], internalMemo: '고객사 예산 보류로 홀딩',
    updatedAt: '2026-05-20T10:00:00+09:00',
  }),
  make({
    id: 'pj-020', projectName: '[SAM.SOTTA] AI Master Builder 공개과정', clientId: 'cl-samsotta', clientName: 'SAM.SOTTA',
    courseName: 'AI Master Builder 공개과정', topic: 'AI웹앱', description: '자사 주관 공개 유료과정 (B2C).',
    startDate: '2026-06-14', endDate: '2026-06-28', managerName: '운영팀', priority: '높음',
    projectStatus: '운영중', revenueStatus: '수금대기', paymentStatus: '지급대상', settlementStatus: '미시작',
    contractAmount: 27500000, trainerFeeBudget: 6000000, operationBudget: 2500000, materialBudget: 1500000, productionBudget: 2000000, etcCost: 1500000,
    taxInvoiceIssued: true, trainerIds: ['in-song', 'in-lee'], collectionDueDate: '2026-07-15',
    prepItems: [pi('수강생 모집', '운영', true), pi('실습 플랫폼 준비', '운영', true), pi('수료증 제작', '제작물', false)],
    clientRequest: '자사 공개과정 — 마케팅 연계',
    nextAction: '수료증 제작', riskFlags: [], updatedAt: '2026-06-05T06:00:00+09:00',
  }),
];
