// =============================================================
// 데이터 소스 추상화 (Notion/Supabase 교체 지점)
// 모든 화면은 이 인터페이스만 의존한다. 현재 구현은 SampleDataSource.
// 추후: NotionDataSource / SupabaseDataSource 를 같은 인터페이스로
//       구현하고 activeDataSource 만 바꾸면 전체 앱이 그대로 동작한다.
// =============================================================
import type { Project, Instructor, Client, PaymentRequest, SyncStatus } from '../types';
import { sampleProjects, sampleInstructors, sampleClients, samplePaymentRequests } from '../data/sampleData';

export interface DataSource {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined>;
  getInstructors(): Promise<Instructor[]>;
  getClients(): Promise<Client[]>;
  getPaymentRequests(): Promise<PaymentRequest[]>;
  updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined>;
  getSyncStatus(): Promise<SyncStatus>;
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

  async updateProject(id: string, patch: Partial<Project>) {
    await delay(60);
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    this.projects[idx] = { ...this.projects[idx], ...patch, updatedAt: new Date().toISOString() };
    return clone(this.projects[idx]);
  }

  async getInstructors() { await delay(); return clone(this.instructors); }
  async getClients() { await delay(); return clone(this.clients); }
  async getPaymentRequests() { await delay(); return clone(this.payments); }

  async updatePaymentRequest(id: string, patch: Partial<PaymentRequest>) {
    await delay(60);
    const idx = this.payments.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    this.payments[idx] = { ...this.payments[idx], ...patch };
    return clone(this.payments[idx]);
  }

  async getSyncStatus(): Promise<SyncStatus> {
    await delay(60);
    return { status: 'synced', lastSyncedAt: '2026-06-05T08:00:00+09:00', syncedCount: this.projects.length, message: '샘플 데이터 모드' };
  }
}

// ── 활성 데이터 소스 (여기만 교체) ─────────────────────────
export const dataSource: DataSource = new SampleDataSource();
