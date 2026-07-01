// =============================================================
// 실제 Supabase(groupware 스키마) 연동 구현체.
// SampleDataSource와 동일한 DataSource 인터페이스를 구현하므로
// dataSource.ts의 마지막 줄만 교체하면 전체 앱이 그대로 동작한다.
//
// ⚠️ 알려진 한계(문서화):
// - prepItems 개별 체크 상태는 DB에 저장되지 않음(Notion 원본이 태그 목록이라 항목별 완료여부 없음).
//   토글 시 화면에는 즉시 반영되나 새로고침하면 초기화됨(추후 별도 테이블로 보완 가능).
// - reportCompleted, clientRequest, history(변경이력)는 DB 대응 필드가 없어 항상 기본값(false/빈 배열).
// - trainerFeeBudget 등 4개 예산 카테고리는 project_costs.category(강사비/인건비/교육비/대관비/기타)를
//   근사 매핑하여 집계한 값이다(1:1 대응 아님).
// =============================================================
import { supabase } from './supabaseClient';
import type { DataSource } from './dataSource';
import type { Project, Instructor, Client, PaymentRequest, SyncStatus, PrepItem } from '../types';
import {
  dbStatusToProjectStatus, projectStatusToDbStatus,
  deriveRevenueStatus, derivePaymentStatus, deriveSettlementStatus,
} from './statusMapping';

// ---- 원가 카테고리 → 4분류 예산 근사 매핑 ----
const budgetBucket = (category: string | null): 'trainer' | 'operation' | 'material' | 'production' | 'etc' => {
  switch (category) {
    case '강사비': return 'trainer';
    case '대관비': return 'operation';
    case '교육비': return 'material';
    case '인건비': return 'production';
    default: return 'etc';
  }
};

interface CostRow {
  id: number; project_id: number; category: string | null; payee_type: string | null; payee_id: number | null;
  payee_name: string | null; budget_amount: number | null; actual_payment_amount: number | null;
  status: string; paid_month: string | null; is_card_payment: boolean; is_payable: boolean;
  is_cost_recognized: boolean; remarks: string | null;
}

function buildProject(row: any, clientName: string, managerName: string, costs: CostRow[]): Project {
  const expectedCost = costs.reduce((s, c) => s + (c.is_cost_recognized ? (c.budget_amount ?? 0) : 0), 0);
  const actualCost = costs.reduce((s, c) => s + (c.is_cost_recognized ? (c.actual_payment_amount ?? 0) : 0), 0);
  const costForProfit = actualCost > 0 ? actualCost : expectedCost;
  const finalEstimate = Number(row.final_estimate ?? 0);
  const expectedProfit = finalEstimate - costForProfit;
  const profitRate = finalEstimate > 0 ? Number(((expectedProfit / finalEstimate) * 100).toFixed(1)) : 0;

  const sumBy = (bucket: string) => costs
    .filter((c) => budgetBucket(c.category) === bucket)
    .reduce((s, c) => s + (c.budget_amount ?? 0), 0);

  const prepItems: PrepItem[] = (row.prep_items ?? []).map((label: string, i: number) => ({
    id: `${row.id}-prep-${i}`,
    label,
    category: '운영' as const,
    completed: true, // Notion 원본에 개별 완료여부 없음 → 태그 존재 = 완료로 간주(근사치)
  }));

  const paymentStatus = derivePaymentStatus(costs.map((c) => ({ status: c.status, is_payable: c.is_payable })));

  const riskFlags: string[] = [];
  if (!row.is_tax_invoice_issued && row.status === '보고/정산') riskFlags.push('세금계산서 미발행');
  if (row.status === '확정/준비' && costs.length === 0) riskFlags.push('예산 미등록');

  return {
    id: String(row.id),
    projectName: row.project_name ?? '',
    clientId: row.client_id ? String(row.client_id) : '',
    clientName,
    courseName: row.project_name ?? '',
    topic: '',
    description: row.progress_notes ?? '',
    startDate: row.session_1_date ?? '',
    endDate: row.session_2_date ?? undefined,
    proposalDueDate: row.proposal_due_date ?? undefined,
    proposalSubmittedDate: row.proposal_submitted_date ?? undefined,
    managerName,
    priority: row.priority ?? '중간',

    projectStatus: dbStatusToProjectStatus(row.status),
    revenueStatus: deriveRevenueStatus(row),
    paymentStatus,
    settlementStatus: deriveSettlementStatus(row.status),

    initialEstimate: Number(row.initial_estimate ?? finalEstimate),
    contractAmount: finalEstimate,
    supplyAmount: Number(row.supply_amount ?? 0),
    vat: Number(row.vat ?? 0),
    totalAmount: finalEstimate,
    collectionDueDate: undefined,
    collectionDoneDate: row.client_payment_date ?? undefined,

    trainerFeeBudget: sumBy('trainer'),
    operationBudget: sumBy('operation'),
    materialBudget: sumBy('material'),
    productionBudget: sumBy('production'),
    etcCost: sumBy('etc'),
    expectedCost,
    actualCost,
    expectedProfit,
    profitRate,

    taxInvoiceIssued: !!row.is_tax_invoice_issued,
    statementSubmitted: !!row.is_statement_submitted,
    reportCompleted: false, // DB 대응 필드 없음(근사 불가) — 항상 false
    paymentRequested: paymentStatus === '지급요청' || paymentStatus === '지급완료',
    paymentCompleted: paymentStatus === '지급완료',
    collectionCompleted: !!row.client_payment_received,

    trainerIds: [...new Set(costs.filter((c) => c.payee_type === 'instructor' && c.payee_id).map((c) => String(c.payee_id)))],
    vendorIds: [...new Set(costs.filter((c) => c.payee_type === 'company' && c.payee_id).map((c) => String(c.payee_id)))],
    prepItems,
    clientRequest: undefined,
    internalMemo: row.etc_notes ?? undefined,

    nextAction: riskFlags[0] ?? (row.status === '종료(수익화완료)' ? '완료' : '진행 확인'),
    riskFlags,
    history: [],
    updatedAt: row.updated_at ?? new Date().toISOString(),

    notionPageId: row.notion_page_id ?? undefined,
    notionUrl: row.notion_url ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    syncStatus: (row.sync_status as any) ?? 'pending',
    syncError: row.sync_error ?? undefined,
  };
}

async function fetchCostsByProjectIds(ids: number[]): Promise<Map<number, CostRow[]>> {
  const map = new Map<number, CostRow[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from('project_costs').select('*').in('project_id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as CostRow[]) {
    const list = map.get(row.project_id) ?? [];
    list.push(row);
    map.set(row.project_id, list);
  }
  return map;
}

class SupabaseDataSource implements DataSource {
  async getProjects(): Promise<Project[]> {
    const { data: rows, error } = await supabase
      .from('projects')
      .select('*, clients(name), users:manager_user_id(name, email)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (rows ?? []).map((r: any) => r.id);
    const costMap = await fetchCostsByProjectIds(ids);

    return (rows ?? []).map((r: any) =>
      buildProject(
        r,
        r.clients?.name ?? '',
        r.users?.name ?? r.users?.email ?? '',
        costMap.get(r.id) ?? [],
      ),
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data: r, error } = await supabase
      .from('projects')
      .select('*, clients(name), users:manager_user_id(name, email)')
      .eq('id', Number(id))
      .maybeSingle();
    if (error) throw error;
    if (!r) return undefined;
    const costMap = await fetchCostsByProjectIds([r.id]);
    return buildProject(r, r.clients?.name ?? '', r.users?.name ?? r.users?.email ?? '', costMap.get(r.id) ?? []);
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined> {
    const dbPatch: Record<string, unknown> = {};

    if (patch.taxInvoiceIssued !== undefined) dbPatch.is_tax_invoice_issued = patch.taxInvoiceIssued;
    if (patch.statementSubmitted !== undefined) dbPatch.is_statement_submitted = patch.statementSubmitted;
    if (patch.collectionCompleted !== undefined) dbPatch.client_payment_received = patch.collectionCompleted;
    if (patch.collectionDoneDate !== undefined) dbPatch.client_payment_date = patch.collectionDoneDate;
    if (patch.internalMemo !== undefined) dbPatch.etc_notes = patch.internalMemo;
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;

    if (patch.settlementStatus === '결산완료') dbPatch.status = '종료(수익화완료)';
    else if (patch.projectStatus !== undefined) dbPatch.status = projectStatusToDbStatus(patch.projectStatus);

    // prepItems 토글은 DB 미지원(설계상 한계) — 로컬 상태만 반영, 서버 저장 생략
    if (Object.keys(dbPatch).length === 0) {
      return this.getProject(id);
    }

    dbPatch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('projects').update(dbPatch).eq('id', Number(id));
    if (error) throw error;
    return this.getProject(id);
  }

  async getInstructors(): Promise<Instructor[]> {
    const { data, error } = await supabase.from('instructors').select('*').eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      name: r.name,
      expertise: r.lecture_topics ?? [],
      phone: r.contact ?? undefined,
      email: r.email ?? undefined,
      defaultFee: Number(r.fee_basis ?? 0),
      accountInfo: r.bank_name && r.account_number ? `${r.bank_name} ${r.account_number}` : undefined,
      memo: undefined,
    }));
  }

  async getClients(): Promise<Client[]> {
    const { data, error } = await supabase.from('clients').select('*');
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      name: r.name,
      type: '기타' as const, // DB에 분류 필드 없음(구조차이표 확인사항)
      contactName: '',
      contactPhone: undefined,
      contactEmail: undefined,
      memo: undefined,
    }));
  }

  async getPaymentRequests(): Promise<PaymentRequest[]> {
    const { data, error } = await supabase
      .from('project_costs')
      .select('*, projects(project_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: r.projects?.project_name ?? undefined,
      payeeType: r.payee_type === 'instructor' ? '강사' : r.payee_type === 'company' ? '업체' : '기타',
      payeeName: r.payee_name ?? '',
      amount: Number(r.actual_payment_amount ?? r.budget_amount ?? 0),
      dueDate: r.paid_month ?? '',
      status: r.status,
      memo: r.remarks ?? undefined,
    }));
  }

  async updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      dbPatch.status = patch.status;
      if (patch.status === '지급완료') dbPatch.paid_month = new Date().toISOString().slice(0, 7);
    }
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from('project_costs').update(dbPatch).eq('id', Number(id));
      if (error) throw error;
    }
    const { data: r, error: fetchErr } = await supabase
      .from('project_costs').select('*, projects(project_name)').eq('id', Number(id)).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!r) return undefined;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: r.projects?.project_name ?? undefined,
      payeeType: r.payee_type === 'instructor' ? '강사' : r.payee_type === 'company' ? '업체' : '기타',
      payeeName: r.payee_name ?? '',
      amount: Number(r.actual_payment_amount ?? r.budget_amount ?? 0),
      dueDate: r.paid_month ?? '',
      status: r.status,
      memo: r.remarks ?? undefined,
    };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const { data: last } = await supabase
      .from('notion_sync_log').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle();
    return {
      status: 'synced',
      lastSyncedAt: last?.synced_at ?? undefined,
      syncedCount: count ?? 0,
      message: 'Supabase 연동 모드',
    };
  }
}

export const supabaseDataSource: DataSource = new SupabaseDataSource();
