// =============================================================
// 데이터 소스 추상화 (Notion/Supabase 교체 지점)
// 모든 화면은 이 인터페이스만 의존한다. 현재 구현은 SampleDataSource.
// 추후: NotionDataSource / SupabaseDataSource 를 같은 인터페이스로
//       구현하고 activeDataSource 만 바꾸면 전체 앱이 그대로 동작한다.
// =============================================================
import type { Project, Instructor, Client, PaymentRequest, SyncStatus, Company, NotionFieldMapping, ProjectSyncLog, RevenueDistribution } from '../types';
import { sampleProjects, sampleInstructors, sampleClients, samplePaymentRequests } from '../data/sampleData';

export interface NewProjectCostInput {
  category: '강사비' | '인건비' | '교육비' | '대관비' | '기타';
  payeeType?: 'instructor' | 'company' | 'etc';
  payeeId?: string;
  payeeName: string;
  budgetAmount: number;
  isCardPayment?: boolean;
  remarks?: string;
}

export interface DataSource {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined>;
  createProject(input: { projectName: string; clientName: string; finalEstimate: number; revenueMonth?: string; startDate?: string; status?: string }): Promise<string>;
  getInstructors(): Promise<Instructor[]>;
  addInstructor(input: Omit<Instructor, 'id'>): Promise<string>;
  updateInstructor(id: string, patch: Partial<Instructor>): Promise<void>;
  deleteInstructor(id: string): Promise<void>;
  getCompanies(): Promise<Company[]>;
  addCompany(input: Omit<Company, 'id'>): Promise<string>;
  updateCompany(id: string, patch: Partial<Company>): Promise<void>;
  deleteCompany(id: string): Promise<void>;
  getClients(): Promise<Client[]>;
  recomputeClientPaymentLag(): Promise<number>;
  getPaymentRequests(): Promise<PaymentRequest[]>;
  updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined>;
  updateProjectCost(costId: string, patch: { payeeName?: string; budgetAmount?: number; remarks?: string; payeeType?: 'instructor' | 'company' | 'etc'; payeeId?: string | null; isCardPayment?: boolean; category?: string }): Promise<void>;
  recoverNotionLink(id: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  addProjectCost(projectId: string, input: NewProjectCostInput): Promise<void>;
  deleteProjectCost(id: string): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
  /** 프로젝트별 Notion 동기화 이력 (히스토리 탭) */
  getProjectSyncLogs(projectId: string): Promise<ProjectSyncLog[]>;
  // ─ 프로젝트 그룹(묶음) 관리 ─
  createGroupChild(masterId: string, input: {
    groupType: 'recurring'; projectName: string; amount: number;
    executionDate?: string;
    masterClientId?: string; masterStatus?: string; masterVatType?: string; masterRevenueMonth?: string;
  }): Promise<void>;
  attachProjectsToGroup(masterId: string, childIds: string[], groupType?: 'merged' | 'recurring'): Promise<void>;
  detachFromGroup(childId: string): Promise<void>;
  deleteGroupChild(childId: string): Promise<void>;
  // ─ 매출분배(계열사) 관리 — projects와 분리된 정산 전용 테이블 (그룹웨어 내부, 노션 비동기화) ─
  getDistributions(projectId: string): Promise<RevenueDistribution[]>;
  addDistribution(masterId: string, input: { clientName: string; amount: number; distributionRatio?: number }): Promise<void>;
  updateDistribution(id: string, patch: Partial<Pick<RevenueDistribution, 'clientName' | 'amount' | 'distributionRatio' | 'taxInvoiceIssued' | 'taxInvoiceDate' | 'paymentReceived' | 'paymentDate'>>): Promise<void>;
  deleteDistribution(id: string): Promise<void>;
  // Notion 연동 매핑 관리 (관리자 전용)
  getNotionFieldMappings(): Promise<NotionFieldMapping[]>;
  addNotionFieldMapping(input: Omit<NotionFieldMapping, 'id'>): Promise<void>;
  updateNotionFieldMapping(id: string, patch: Partial<NotionFieldMapping>): Promise<void>;
  deleteNotionFieldMapping(id: string): Promise<void>;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

// 세션 동안 변경을 유지하는 인메모리 스토어 (DB 대체)
class SampleDataSource implements DataSource {
  private projects: Project[] = clone(sampleProjects);
  private instructors: Instructor[] = clone(sampleInstructors);
  private clients: Client[] = clone(sampleClients);
  private payments: PaymentRequest[] = clone(samplePaymentRequests);

  async getProjects() { await delay(); return clone(this.projects); }
  async getProject(id: string) { await delay(60); return clone(this.projects.find((p) => p.id === id)); }

  async createProject(): Promise<string> { throw new Error('샘플 모드에서는 프로젝트 생성이 지원되지 않습니다'); }
  async updateProjectCost(): Promise<void> { throw new Error('샘플 모드 미지원'); }
  async recoverNotionLink(): Promise<void> { throw new Error('샘플 모드 미지원'); }
  async deleteProject(): Promise<void> { throw new Error('샘플 모드 미지원'); }
  async updateProject(id: string, patch: Partial<Project>) {
    await delay(60);
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    this.projects[idx] = { ...this.projects[idx], ...patch, updatedAt: new Date().toISOString() };
    return clone(this.projects[idx]);
  }

  async getInstructors() { await delay(); return clone(this.instructors); }
  async getClients() { await delay(); return clone(this.clients); }
  async recomputeClientPaymentLag() { await delay(); return 0; }
  async getPaymentRequests() { await delay(); return clone(this.payments); }

  async updatePaymentRequest(id: string, patch: Partial<PaymentRequest>) {
    await delay(60);
    const idx = this.payments.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    this.payments[idx] = { ...this.payments[idx], ...patch };
    return clone(this.payments[idx]);
  }

  async addProjectCost(projectId: string, input: import('./dataSource').NewProjectCostInput) {
    await delay(60);
    this.payments.push({
      id: `pr-sample-${Date.now()}`,
      projectId,
      payeeType: input.payeeType === 'instructor' ? '강사' : input.payeeType === 'company' ? '업체' : '기타',
      payeeName: input.payeeName,
      amount: input.budgetAmount,
      dueDate: '',
      status: '지급대상',
    });
  }

  async getCompanies() { await delay(); return []; }
  async addInstructor(input: Omit<Instructor, 'id'>) {
    await delay(60);
    const id = `in-sample-${Date.now()}`;
    this.instructors.push({ ...input, id });
    return id;
  }
  async updateInstructor(id: string, patch: Partial<Instructor>) {
    await delay(60);
    const idx = this.instructors.findIndex((i) => i.id === id);
    if (idx < 0) return;
    this.instructors[idx] = { ...this.instructors[idx], ...patch };
  }
  async deleteInstructor(id: string) {
    await delay(60);
    this.instructors = this.instructors.filter((i) => i.id !== id);
  }
  async addCompany() { await delay(60); return `co-sample-${Date.now()}`; }
  async updateCompany() { await delay(60); }
  async deleteCompany() { await delay(60); }

  async deleteProjectCost(id: string) {
    await delay(60);
    this.payments = this.payments.filter((p) => p.id !== id);
  }

  async getNotionFieldMappings() { await delay(); return []; }
  async addNotionFieldMapping() { await delay(60); }
  async updateNotionFieldMapping() { await delay(60); }
  async deleteNotionFieldMapping() { await delay(60); }

  async getProjectSyncLogs(_projectId: string): Promise<ProjectSyncLog[]> { await delay(); return []; }
  async createGroupChild(): Promise<void> { await delay(); }
  async attachProjectsToGroup(): Promise<void> { await delay(); }
  async detachFromGroup(): Promise<void> { await delay(); }
  async deleteGroupChild(): Promise<void> { await delay(); }
  async getDistributions(): Promise<RevenueDistribution[]> { await delay(); return []; }
  async addDistribution(): Promise<void> { await delay(); }
  async updateDistribution(): Promise<void> { await delay(); }
  async deleteDistribution(): Promise<void> { await delay(); }

  async getSyncStatus(): Promise<SyncStatus> {
    await delay(60);
    return { status: 'synced', lastSyncedAt: '2026-06-05T08:00:00+09:00', syncedCount: this.projects.length, message: '샘플 데이터 모드' };
  }
}

// ── 활성 데이터 소스 (여기만 교체) ─────────────────────────
// 샘플 모드로 되돌리려면 아래 줄로 교체: export const dataSource: DataSource = new SampleDataSource();
import { supabaseDataSource } from './SupabaseDataSource';
export const dataSource: DataSource = supabaseDataSource;
