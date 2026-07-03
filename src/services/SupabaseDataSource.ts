// =============================================================
// 실제 Supabase(groupware 스키마) 연동 구현체.
// SampleDataSource와 동일한 DataSource 인터페이스를 구현하므로
// dataSource.ts의 마지막 줄만 교체하면 전체 앱이 그대로 동작한다.
//
// ⚠️ 알려진 한계(문서화):
// - prepItems 개별 체크 상태는 DB에 저장되지 않음(Notion 원본이 태그 목록이라 항목별 완료여부 없음).
//   토글 시 화면에는 즉시 반영되나 새로고침하면 초기화됨(추후 별도 테이블로 보완 가능).
// - clientRequest, history(변경이력)는 DB 대응 필드가 없어 항상 기본값(undefined/빈 배열).
// - trainerFeeBudget 등 4개 예산 카테고리는 project_costs.category(강사비/인건비/교육비/대관비/기타)를
//   근사 매핑하여 집계한 값이다(1:1 대응 아님).
// =============================================================
import { supabase } from './supabaseClient';
import type { DataSource } from './dataSource';
import type { Project, Instructor, Client, PaymentRequest, ProjectSyncLog, SyncStatus, PrepItem, Company, NotionFieldMapping } from '../types';
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
  const totalAmount = Number(row.total_amount ?? finalEstimate); // VAT 포함/별도 반영된 실제 계약금액
  const supplyAmount = Number(row.supply_amount ?? 0); // 공급가액(VAT 제외, 실매출 기준)
  // 이익/이익률은 부가세를 제외한 공급가액(실매출) 기준으로 산정 — VAT는 세무상 통과 금액이라 손익에 포함하지 않음
  const expectedProfit = supplyAmount - costForProfit;
  const profitRate = supplyAmount > 0 ? Number(((expectedProfit / supplyAmount) * 100).toFixed(1)) : 0;

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
    contractAmount: totalAmount,
    supplyAmount,
    vat: Number(row.vat ?? 0),
    totalAmount,
    vatType: row.vat_type === '별도' ? '별도' : '포함',
    collectionDueDate: undefined,
    collectionDoneDate: row.client_payment_date ?? undefined,
    taxInvoiceDate: row.tax_invoice_date ?? undefined,
    revenueMonth: row.revenue_month ?? undefined,

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
    proposalSubmitted: !!row.is_proposal_submitted,
    reportCompleted: !!row.is_report_completed,
    paymentRequested: paymentStatus === '지급요청' || paymentStatus === '지급완료',
    paymentCompleted: paymentStatus === '지급완료',
    collectionCompleted: !!row.client_payment_received,

    trainerIds: [...new Set(costs.filter((c) => c.payee_type === 'instructor' && c.payee_id).map((c) => String(c.payee_id)))],
    vendorIds: [...new Set(costs.filter((c) => c.payee_type === 'company' && c.payee_id).map((c) => String(c.payee_id)))],
    prepItems,
    clientRequest: undefined,
    internalMemo: row.etc_notes ?? undefined,

    nextAction: riskFlags[0] ?? (row.status === '종료(수익화 완료)' ? '완료' : '진행 확인'),
    riskFlags,
    history: [],
    updatedAt: row.updated_at ?? new Date().toISOString(),

    notionPageId: row.notion_page_id ?? undefined,
    finalEstimate: row.final_estimate != null ? Number(row.final_estimate) : undefined,
    sourceType: row.source_type ?? undefined,
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

    const projects = (rows ?? []).map((r: any) =>
      buildProject(
        r,
        r.clients?.name ?? '',
        r.users?.name ?? r.users?.email ?? '',
        costMap.get(r.id) ?? [],
      ),
    );
    return SupabaseDataSource.enrichGroups(projects);
  }

  /**
   * 프로젝트 그룹(묶음) 통계 필드 주입 — 구 시스템 집계 규칙 이식:
   * 자식 중 금액 보유 건이 있으면 마스터의 유효매출(effectiveAmount)은 0 (이중계상 방지),
   * 자식이 전부 0이면 마스터 금액 사용. 마스터에는 그룹 합계/자식 수를 함께 제공한다.
   */
  private static enrichGroups(projects: Project[]): Project[] {
    const children = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.parentId) {
        if (!children.has(p.parentId)) children.set(p.parentId, []);
        children.get(p.parentId)!.push(p);
      }
    }
    for (const p of projects) {
      const kids = children.get(p.id);
      if (kids && kids.length > 0) {
        const kidsSum = kids.reduce((sum, c) => sum + (c.contractAmount || 0), 0);
        p.groupChildCount = kids.length;
        p.groupTotalAmount = kidsSum > 0 ? kidsSum : p.contractAmount;
        p.effectiveAmount = kidsSum > 0 ? 0 : p.contractAmount;
      } else {
        p.effectiveAmount = p.contractAmount;
      }
    }
    return projects;
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
    if ('taxInvoiceDate' in patch) dbPatch.tax_invoice_date = patch.taxInvoiceDate ?? null;
    if (patch.vatType !== undefined) dbPatch.vat_type = patch.vatType;
    if (patch.statementSubmitted !== undefined) dbPatch.is_statement_submitted = patch.statementSubmitted;
    if (patch.proposalSubmitted !== undefined) dbPatch.is_proposal_submitted = patch.proposalSubmitted;
    if (patch.reportCompleted !== undefined) dbPatch.is_report_completed = patch.reportCompleted;
    if (patch.collectionCompleted !== undefined) dbPatch.client_payment_received = patch.collectionCompleted;
    if ('collectionDoneDate' in patch) dbPatch.client_payment_date = patch.collectionDoneDate ?? null;
    if (patch.internalMemo !== undefined) dbPatch.etc_notes = patch.internalMemo;
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;
    // 그룹 자식(노션 미연동) 금액·시행일 수정 지원 — 금액은 세전(final_estimate) 기준
    if (patch.finalEstimate !== undefined) dbPatch.final_estimate = patch.finalEstimate;
    if ('startDate' in patch) dbPatch.session_1_date = patch.startDate || null;

    // 결산완료 처리 시 전체 진행상태를 '종료'로 승격, 취소 시 '보고/정산' 단계로 되돌림
    if (patch.settlementStatus === '결산완료') dbPatch.status = '종료(수익화 완료)';
    else if (patch.settlementStatus === '정산중') dbPatch.status = '보고/정산';
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
      bankName: r.bank_name ?? undefined,
      accountNumber: r.account_number ?? undefined,
      residentNumber: r.resident_number ?? undefined,
      address: r.address ?? undefined,
    }));
  }

  async addInstructor(input: Omit<Instructor, 'id'>): Promise<void> {
    const { error } = await supabase.from('instructors').insert({
      name: input.name,
      contact: input.phone ?? null,
      email: input.email ?? null,
      lecture_topics: input.expertise ?? [],
      fee_basis: input.defaultFee ?? null,
      bank_name: input.bankName ?? null,
      account_number: input.accountNumber ?? null,
      resident_number: input.residentNumber ?? null,
      address: input.address ?? null,
      is_active: true,
    });
    if (error) throw error;
  }

  async updateInstructor(id: string, patch: Partial<Instructor>): Promise<void> {
    const dbPatch: Record<string, any> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.phone !== undefined) dbPatch.contact = patch.phone || null;
    if (patch.email !== undefined) dbPatch.email = patch.email || null;
    if (patch.residentNumber !== undefined) dbPatch.resident_number = patch.residentNumber || null;
    if (patch.address !== undefined) dbPatch.address = patch.address || null;
    if (patch.bankName !== undefined) dbPatch.bank_name = patch.bankName || null;
    if (patch.accountNumber !== undefined) dbPatch.account_number = patch.accountNumber || null;
    const { error } = await supabase.from('instructors').update(dbPatch).eq('id', Number(id));
    if (error) throw error;
  }

  async deleteInstructor(id: string): Promise<void> {
    const { error } = await supabase.from('instructors').delete().eq('id', Number(id));
    if (error) throw error;
  }

  async getCompanies(): Promise<Company[]> {
    const { data, error } = await supabase.from('companies').select('*').eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      companyName: r.company_name,
      ceoName: r.ceo_name ?? undefined,
      businessNumber: r.business_number ?? undefined,
      bankName: r.bank_name ?? undefined,
      accountNumber: r.account_number ?? undefined,
      taxType: r.tax_type ?? undefined,
      managerContact: r.manager_contact ?? undefined,
      email: r.email ?? undefined,
      businessDescription: r.business_description ?? undefined,
    }));
  }

  async addCompany(input: Omit<Company, 'id'>): Promise<void> {
    const { error } = await supabase.from('companies').insert({
      company_name: input.companyName,
      ceo_name: input.ceoName ?? null,
      business_number: input.businessNumber ?? null,
      bank_name: input.bankName ?? null,
      account_number: input.accountNumber ?? null,
      tax_type: input.taxType ?? null,
      manager_contact: input.managerContact ?? null,
      email: input.email ?? null,
      business_description: input.businessDescription ?? null,
      is_active: true,
    });
    if (error) throw error;
  }

  async updateCompany(id: string, patch: Partial<Company>): Promise<void> {
    const dbPatch: Record<string, any> = {};
    if (patch.companyName !== undefined) dbPatch.company_name = patch.companyName;
    if (patch.ceoName !== undefined) dbPatch.ceo_name = patch.ceoName || null;
    if (patch.businessNumber !== undefined) dbPatch.business_number = patch.businessNumber || null;
    if (patch.bankName !== undefined) dbPatch.bank_name = patch.bankName || null;
    if (patch.accountNumber !== undefined) dbPatch.account_number = patch.accountNumber || null;
    if (patch.taxType !== undefined) dbPatch.tax_type = patch.taxType || null;
    if (patch.managerContact !== undefined) dbPatch.manager_contact = patch.managerContact || null;
    if (patch.email !== undefined) dbPatch.email = patch.email || null;
    if (patch.businessDescription !== undefined) dbPatch.business_description = patch.businessDescription || null;
    const { error } = await supabase.from('companies').update(dbPatch).eq('id', Number(id));
    if (error) throw error;
  }

  async deleteCompany(id: string): Promise<void> {
    const { error } = await supabase.from('companies').delete().eq('id', Number(id));
    if (error) throw error;
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

  // 지급기한: 요청사항 4 — "시행일(session_1_date) 기준 익월 말일 지급"
  private computePaymentDueDate(sessionDate?: string | null): string {
    if (!sessionDate) return '';
    const d = new Date(sessionDate);
    if (isNaN(d.getTime())) return '';
    const due = new Date(d.getFullYear(), d.getMonth() + 2, 0); // 익월의 마지막 날
    return due.toISOString().slice(0, 10);
  }

  // DB(project_costs.status: 미지급/지급요청/지급완료) ↔ 프론트(PaymentStatus: 지급대상/지급요청/지급완료/보류) 매핑
  private static dbCostStatusToFrontend(s: string): PaymentRequest['status'] {
    if (s === '미지급') return '지급대상';
    return s as PaymentRequest['status'];
  }
  private static frontendStatusToDbCostStatus(s: string): string {
    if (s === '지급대상') return '미지급';
    return s;
  }

  private async buildPaymentRequests(rows: any[]): Promise<PaymentRequest[]> {
    const instructorIds = [...new Set(rows.filter((r) => r.payee_type === 'instructor' && r.payee_id).map((r) => r.payee_id))];
    const companyIds = [...new Set(rows.filter((r) => r.payee_type === 'company' && r.payee_id).map((r) => r.payee_id))];

    const [{ data: instructors }, { data: companies }] = await Promise.all([
      instructorIds.length
        ? supabase.from('instructors').select('id, bank_name, account_number, resident_number, address').in('id', instructorIds)
        : Promise.resolve({ data: [] as any[] }),
      companyIds.length
        ? supabase.from('companies').select('id, bank_name, account_number').in('id', companyIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const instructorMap = new Map((instructors ?? []).map((i: any) => [i.id, i]));
    const companyMap = new Map((companies ?? []).map((c: any) => [c.id, c]));

    return rows.map((r: any) => {
      const acct = r.payee_type === 'instructor' ? instructorMap.get(r.payee_id) : r.payee_type === 'company' ? companyMap.get(r.payee_id) : null;
      const accountInfo = acct && acct.bank_name && acct.account_number ? `${acct.bank_name} ${acct.account_number}` : undefined;
      return {
        id: String(r.id),
        projectId: String(r.project_id),
        projectName: r.projects?.project_name ?? undefined,
        payeeType: r.payee_type === 'instructor' ? '강사' : r.payee_type === 'company' ? '업체' : '기타',
        payeeName: r.payee_name ?? '',
        amount: Number(r.actual_payment_amount ?? r.budget_amount ?? 0),
        dueDate: r.status === '지급완료' ? (r.paid_month ?? '') : this.computePaymentDueDate(r.projects?.session_1_date),
        status: SupabaseDataSource.dbCostStatusToFrontend(r.status),
        memo: r.remarks ?? undefined,
        payeeAccountInfo: accountInfo,
        payeeId: r.payee_id != null ? String(r.payee_id) : undefined,
        bankName: acct?.bank_name ?? undefined,
        accountNumber: acct?.account_number ?? undefined,
        residentNumber: acct?.resident_number ?? undefined,
        address: acct?.address ?? undefined,
        infoConfirmed: !!r.payment_info_confirmed,
        vendorTaxInvoiceReceived: !!r.vendor_tax_invoice_received,
        vendorTaxInvoiceDate: r.vendor_tax_invoice_date ?? undefined,
        paidMonth: r.paid_month ?? undefined,
      } as PaymentRequest;
    });
  }

  async getPaymentRequests(): Promise<PaymentRequest[]> {
    const { data, error } = await supabase
      .from('project_costs')
      .select('*, projects(project_name, session_1_date)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.buildPaymentRequests(data ?? []);
  }

  async updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      dbPatch.status = SupabaseDataSource.frontendStatusToDbCostStatus(patch.status);
      // 지급월: 사용자가 선택한 값 우선(소급 처리 지원), 미지정 시 현재 월
      if (patch.status === '지급완료') dbPatch.paid_month = patch.paidMonth ?? new Date().toISOString().slice(0, 7);
    }
    if (patch.infoConfirmed !== undefined) dbPatch.payment_info_confirmed = patch.infoConfirmed;
    if (patch.vendorTaxInvoiceReceived !== undefined) dbPatch.vendor_tax_invoice_received = patch.vendorTaxInvoiceReceived;
    if ('vendorTaxInvoiceDate' in patch) dbPatch.vendor_tax_invoice_date = patch.vendorTaxInvoiceDate ?? null;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from('project_costs').update(dbPatch).eq('id', Number(id));
      if (error) throw error;
    }
    const { data: r, error: fetchErr } = await supabase
      .from('project_costs').select('*, projects(project_name, session_1_date)').eq('id', Number(id)).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!r) return undefined;
    const [built] = await this.buildPaymentRequests([r]);
    return built;
  }

  async deleteProjectCost(id: string): Promise<void> {
    const { error } = await supabase.from('project_costs').delete().eq('id', Number(id));
    if (error) throw error;
  }

  async addProjectCost(projectId: string, input: {
    category: '강사비' | '인건비' | '교육비' | '대관비' | '기타';
    payeeType?: 'instructor' | 'company' | 'etc';
    payeeId?: string;
    payeeName: string;
    budgetAmount: number;
    isCardPayment?: boolean;
    remarks?: string;
  }): Promise<void> {
    const { error } = await supabase.from('project_costs').insert({
      project_id: Number(projectId),
      category: input.category,
      payee_type: input.payeeType && input.payeeType !== 'etc' ? input.payeeType : null,
      payee_id: input.payeeId ? Number(input.payeeId) : null,
      payee_name: input.payeeName,
      budget_amount: input.budgetAmount,
      is_card_payment: input.isCardPayment ?? false,
      is_payable: !(input.isCardPayment ?? false),
      is_cost_recognized: true,
      status: '미지급',
      remarks: input.remarks ?? null,
    });
    if (error) throw error;
  }

  // ---------- Notion 연동 매핑 관리 (관리자화면 > Notion 연동 관리) ----------
  async getNotionFieldMappings(): Promise<NotionFieldMapping[]> {
    const { data, error } = await supabase
      .from('notion_field_mappings')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      entityType: r.entity_type,
      supabaseColumn: r.supabase_column,
      notionPropertyName: r.notion_property_name,
      dataType: r.data_type,
      syncDirection: r.sync_direction,
      isActive: !!r.is_active,
    }));
  }

  async addNotionFieldMapping(input: Omit<NotionFieldMapping, 'id'>): Promise<void> {
    const { error } = await supabase.from('notion_field_mappings').insert({
      entity_type: input.entityType,
      supabase_column: input.supabaseColumn,
      notion_property_name: input.notionPropertyName,
      data_type: input.dataType,
      sync_direction: input.syncDirection,
      is_active: input.isActive,
    });
    if (error) throw error;
  }

  async updateNotionFieldMapping(id: string, patch: Partial<NotionFieldMapping>): Promise<void> {
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.notionPropertyName !== undefined) dbPatch.notion_property_name = patch.notionPropertyName;
    if (patch.dataType !== undefined) dbPatch.data_type = patch.dataType;
    if (patch.syncDirection !== undefined) dbPatch.sync_direction = patch.syncDirection;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
    if (patch.supabaseColumn !== undefined) dbPatch.supabase_column = patch.supabaseColumn;
    const { error } = await supabase.from('notion_field_mappings').update(dbPatch).eq('id', Number(id));
    if (error) throw error;
  }

  async deleteNotionFieldMapping(id: string): Promise<void> {
    const { error } = await supabase.from('notion_field_mappings').delete().eq('id', Number(id));
    if (error) throw error;
  }

  /** 고객사 find-or-create (매출분배 자식용) */
  private async findOrCreateClient(name: string): Promise<number> {
    const { data: found } = await supabase.from('clients').select('id').eq('name', name).limit(1);
    if (found && found.length > 0) return found[0].id;
    const { data: created, error } = await supabase.from('clients').insert({ name }).select('id').single();
    if (error) throw error;
    return created!.id;
  }

  /** 그룹 자식 생성 (recurring 회차 / distribution 분배) — manual_groupware, 노션 동기화 비대상 */
  async createGroupChild(masterId: string, input: {
    groupType: 'recurring' | 'distribution';
    projectName: string;
    clientName?: string;         // distribution: 계열사명 (없으면 마스터 고객사)
    amount: number;
    executionDate?: string;      // recurring 회차 시행일
    distributionRatio?: number;
    masterClientId?: string;
    masterStatus?: string;
    masterVatType?: string;
    masterRevenueMonth?: string;
  }): Promise<void> {
    // 가드: 마스터가 이미 다른 그룹의 자식이면 중첩 그룹이 되므로 금지 (#4)
    const { data: masterRow, error: mErr } = await supabase.from('projects')
      .select('id, parent_id, group_type').eq('id', Number(masterId)).maybeSingle();
    if (mErr) throw mErr;
    if (!masterRow) throw new Error('마스터 프로젝트를 찾을 수 없습니다.');
    if (masterRow.parent_id != null) throw new Error('이미 다른 그룹의 구성인 프로젝트는 마스터가 될 수 없습니다.');

    // 가드: 동일 이름(회차) 자식 중복 방지 (#5)
    const { data: dup } = await supabase.from('projects')
      .select('id').eq('parent_id', Number(masterId)).eq('project_name', input.projectName).limit(1);
    if (dup && dup.length > 0) throw new Error(`동일한 구성("${input.projectName}")이 이미 존재합니다. 회차 번호를 확인하세요.`);

    let clientId: number | null = input.masterClientId ? Number(input.masterClientId) : null;
    if (input.groupType === 'distribution' && input.clientName) {
      clientId = await this.findOrCreateClient(input.clientName.trim());
    }
    const { error } = await supabase.from('projects').insert({
      project_name: input.projectName,
      client_id: clientId,
      parent_id: Number(masterId),
      is_master: false,
      group_type: input.groupType,
      distribution_ratio: input.distributionRatio ?? null,
      final_estimate: input.amount,
      vat_type: input.masterVatType ?? null,
      status: input.masterStatus ?? '확정/준비',
      revenue_month: input.masterRevenueMonth ?? null,
      session_1_date: input.executionDate ?? null,
      source_type: 'manual_groupware',
    });
    if (error) throw error;

    // 마스터 유형 동기화: 유형이 비어 있으면 이번 추가 유형으로 표시 (#1)
    if (!masterRow.group_type) {
      await supabase.from('projects').update({ is_master: true, group_type: input.groupType }).eq('id', Number(masterId));
    }
  }

  /** 기존 프로젝트들을 마스터 아래로 묶기 (merged) */
  async attachProjectsToGroup(masterId: string, childIds: string[], groupType: 'merged' | 'recurring' | 'distribution' = 'merged'): Promise<void> {
    // 가드 (#4): 자기 자신 금지 / 마스터가 이미 자식이면 금지 / 대상이 이미 자식이거나 자식을 가진 마스터면 금지 (중첩·순환 차단)
    if (childIds.includes(masterId)) throw new Error('자기 자신을 그룹에 묶을 수 없습니다.');
    const { data: masterRow } = await supabase.from('projects').select('id, parent_id').eq('id', Number(masterId)).maybeSingle();
    if (!masterRow) throw new Error('마스터 프로젝트를 찾을 수 없습니다.');
    if (masterRow.parent_id != null) throw new Error('이미 다른 그룹의 구성인 프로젝트는 마스터가 될 수 없습니다.');
    const numIds = childIds.map(Number);
    const { data: targets } = await supabase.from('projects').select('id, parent_id').in('id', numIds);
    if ((targets ?? []).some((t: any) => t.parent_id != null)) throw new Error('이미 다른 그룹에 속한 프로젝트가 포함되어 있습니다. 먼저 해제하세요.');
    const { data: grandChildren } = await supabase.from('projects').select('id').in('parent_id', numIds).limit(1);
    if (grandChildren && grandChildren.length > 0) throw new Error('자체 구성(자식)을 가진 프로젝트는 다른 그룹에 묶을 수 없습니다.');

    const { error: childErr } = await supabase.from('projects')
      .update({ parent_id: Number(masterId), group_type: groupType, is_master: false })
      .in('id', childIds.map(Number));
    if (childErr) throw childErr;
    const { error: masterErr } = await supabase.from('projects')
      .update({ is_master: true, group_type: groupType })
      .eq('id', Number(masterId));
    if (masterErr) throw masterErr;
  }

  /** 그룹에서 자식 해제 — 마지막 자식이면 마스터의 그룹 유형도 정리한다 (#6) */
  async detachFromGroup(childId: string): Promise<void> {
    const { data: child } = await supabase.from('projects').select('id, parent_id').eq('id', Number(childId)).maybeSingle();
    const masterId = child?.parent_id ?? null;
    const { error } = await supabase.from('projects')
      .update({ parent_id: null, group_type: null, distribution_ratio: null })
      .eq('id', Number(childId));
    if (error) throw error;
    if (masterId != null) {
      const { data: rest } = await supabase.from('projects').select('id').eq('parent_id', masterId).limit(1);
      if (!rest || rest.length === 0) {
        await supabase.from('projects').update({ group_type: null }).eq('id', masterId);
      }
    }
  }

  /** 앱에서 생성한 그룹 자식 삭제 (#3) — manual_groupware·노션 미연동·비용 0건·자식 없음일 때만. DB 정책상 관리자만 삭제 가능 */
  async deleteGroupChild(childId: string): Promise<void> {
    const idNum = Number(childId);
    const { data: row } = await supabase.from('projects')
      .select('id, source_type, notion_page_id').eq('id', idNum).maybeSingle();
    if (!row) throw new Error('프로젝트를 찾을 수 없습니다.');
    if (row.source_type !== 'manual_groupware' || row.notion_page_id) {
      throw new Error('앱에서 생성한(노션 미연동) 구성만 삭제할 수 있습니다. 대신 그룹 해제를 사용하세요.');
    }
    const { data: costs } = await supabase.from('project_costs').select('id').eq('project_id', idNum).limit(1);
    if (costs && costs.length > 0) throw new Error('예산/비용 항목이 있는 프로젝트는 삭제할 수 없습니다. 비용 삭제 후 시도하거나 그룹 해제를 사용하세요.');
    const { data: kids } = await supabase.from('projects').select('id').eq('parent_id', idNum).limit(1);
    if (kids && kids.length > 0) throw new Error('자체 구성을 가진 프로젝트는 삭제할 수 없습니다.');
    const { error } = await supabase.from('projects').delete().eq('id', idNum);
    if (error) throw error;
  }

  async getProjectSyncLogs(projectId: string): Promise<ProjectSyncLog[]> {
    const { data, error } = await supabase
      .from('notion_sync_log')
      .select('id, direction, status, message, synced_at')
      .eq('entity_type', 'project')
      .eq('entity_id', Number(projectId))
      .order('synced_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: String(r.id), direction: r.direction, status: r.status,
      message: r.message ?? '', syncedAt: r.synced_at,
    }));
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
