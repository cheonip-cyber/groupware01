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
import type { Project, Instructor, Client, PaymentRequest, ProjectSyncLog, SyncStatus, PrepItem, Company, NotionFieldMapping, RevenueDistribution } from '../types';
import { calcWithholdingFor } from '../utils/withholding';
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

function buildProject(row: any, clientName: string, managerName: string, costs: CostRow[],
  instructorNameMap?: Map<number, string>, companyNameMap?: Map<number, { name: string; ceo: string | null }>): Project {
  const expectedCost = costs.reduce((s, c) => s + (c.is_cost_recognized ? (c.budget_amount ?? 0) : 0), 0);
  const actualCost = costs.reduce((s, c) => s + (c.is_cost_recognized ? (c.actual_payment_amount ?? 0) : 0), 0);
  const finalEstimate = Number(row.final_estimate ?? 0);
  const totalAmount = Number(row.total_amount ?? finalEstimate); // VAT 포함/별도 반영된 실제 계약금액
  const supplyAmount = Number(row.supply_amount ?? 0); // 공급가액(VAT 제외, 실매출 기준)
  // 이익/이익률: 구 그룹웨어(gw_monthly_performance_stats) 방식 적용 —
  // 이익 = 매출(총액 total_amount) − 예산비용(budget 합), 이익률 = 이익/매출 ×100
  const expectedProfit = totalAmount - expectedCost;
  // 매출이 0인데 비용만 있으면(이익 음수) 0%가 아니라 -100%로 표기해 손실을 드러낸다
  const profitRate = totalAmount > 0
    ? Number(((expectedProfit / totalAmount) * 100).toFixed(1))
    : expectedProfit < 0 ? -100 : 0;

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
    masterClientName: row.master_client_name ?? undefined,
    notionManager: row.notion_manager ?? undefined,
    clientContactName: row.client_contact_name ?? undefined,
    clientPaymentMemo: row.client_payment_memo ?? undefined,
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
    // 그룹(묶음) 필드 — 이 매핑이 없으면 enrichGroups가 자식을 인식하지 못해
    // 마스터+자식이 전부 개별 합산(매출 이중계상)되고 그룹 UI가 동작하지 않는다
    parentId: row.parent_id != null ? String(row.parent_id) : undefined,
    isMaster: !!row.is_master,
    groupType: row.group_type ?? undefined,
    distributionRatio: row.distribution_ratio != null ? Number(row.distribution_ratio) : undefined,

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
    // 강사비 카테고리는 지급유형이 company로 저장돼 있어도(업체 명의 세금계산서 등) 개요에는 실제 강사 개인명이 보여야 한다 —
    // instructor면 강사DB 이름, company면 대표자명(없으면 업체명)을 우선하고, 매핑이 없으면 저장된 텍스트로 폴백한다.
    trainerNames: [...new Set(
      costs.filter((c) => budgetBucket(c.category) === 'trainer').map((c) => {
        if (c.payee_type === 'instructor' && c.payee_id) return instructorNameMap?.get(c.payee_id) ?? c.payee_name ?? '';
        if (c.payee_type === 'company' && c.payee_id) {
          const co = companyNameMap?.get(c.payee_id);
          return co ? (co.ceo || co.name) : (c.payee_name ?? '');
        }
        return c.payee_name ?? '';
      }).filter(Boolean),
    )],
    prepItems,
    prepChecklist: (row.prep_checklist ?? {}) as Record<string, boolean>,
    clientRequest: undefined,
    internalMemo: row.etc_notes ?? undefined,

    nextAction: riskFlags[0] ?? (row.status === '종료(수익화 완료)' ? '완료' : '진행 확인'),
    riskFlags,
    history: [],
    updatedAt: row.updated_at ?? new Date().toISOString(),

    notionPageId: row.notion_page_id ?? undefined,
    notionMissing: !!row.notion_missing,
    dbStatus: row.status ?? undefined,
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
  // 수백 개 id를 .in()으로 URL에 싣지 않고 전체 조회 — 비용 행 수가 프로젝트 수와 같은 규모라 전체 조회가 더 빠르고 안전
  const { data, error } = await supabase.from('project_costs').select('*');
  if (error) throw error;
  for (const row of (data ?? []) as CostRow[]) {
    const list = map.get(row.project_id) ?? [];
    list.push(row);
    map.set(row.project_id, list);
  }
  return map;
}

// 강사비 항목의 실제 표시명 계산용 — 강사DB 이름, 업체DB(대표자명 포함) 전체를 한 번에 조회해 맵으로 반환.
// project_costs.payee_name은 등록 시점 텍스트 스냅샷이라 갱신되지 않으므로(개요 강사명 표시 정확도를 위해) 항상 최신 원본을 조회한다.
async function fetchNameMaps(): Promise<{ instructorNameMap: Map<number, string>; companyNameMap: Map<number, { name: string; ceo: string | null }> }> {
  const [{ data: instructors, error: iErr }, { data: companies, error: cErr }] = await Promise.all([
    supabase.from('instructors').select('id, name'),
    supabase.from('companies').select('id, company_name, ceo_name'),
  ]);
  if (iErr) throw iErr;
  if (cErr) throw cErr;
  return {
    instructorNameMap: new Map((instructors ?? []).map((i: any) => [i.id, i.name])),
    companyNameMap: new Map((companies ?? []).map((c: any) => [c.id, { name: c.company_name, ceo: c.ceo_name }])),
  };
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
    const { instructorNameMap, companyNameMap } = await fetchNameMaps();

    const projects = (rows ?? []).map((r: any) =>
      buildProject(
        r,
        r.clients?.name ?? '',
        r.users?.name ?? r.users?.email ?? '',
        costMap.get(r.id) ?? [],
        instructorNameMap,
        companyNameMap,
      ),
    );
    const enriched = SupabaseDataSource.enrichGroups(projects);

    // 매출분배(distribution) 마스터는 revenue_distributions에서 건수/합계를 별도 집계 (projects 자식이 없으므로)
    const distMasterIds = enriched.filter((p) => p.groupType === 'distribution' && p.isMaster).map((p) => Number(p.id));
    if (distMasterIds.length > 0) {
      const { data: dist } = await supabase.from('revenue_distributions')
        .select('project_id, amount').in('project_id', distMasterIds);
      const agg = new Map<number, { count: number; total: number }>();
      for (const d of dist ?? []) {
        const cur = agg.get(d.project_id) ?? { count: 0, total: 0 };
        cur.count += 1; cur.total += Number(d.amount ?? 0);
        agg.set(d.project_id, cur);
      }
      for (const p of enriched) {
        if (p.groupType === 'distribution' && p.isMaster) {
          const a = agg.get(Number(p.id));
          p.groupChildCount = a?.count ?? 0;
          p.groupTotalAmount = a?.total ?? 0;
        }
      }
    }
    return enriched;
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
        // merged(기존 묶기)는 실적 있는 개별 프로젝트가 마스터인 유형 → 마스터 매출도 합산해야 과소계상이 없다.
        // 단 마스터 금액=자식 합이면 이중입력(컨테이너형)으로 보고 recurring/distribution처럼 0 처리.
        const mergedIndependent = p.groupType === 'merged' && Math.abs((p.contractAmount || 0) - kidsSum) >= 2;
        p.groupTotalAmount = (kidsSum > 0 ? kidsSum : 0) + (mergedIndependent || kidsSum === 0 ? (p.contractAmount || 0) : 0);
        p.effectiveAmount = kidsSum > 0 ? (mergedIndependent ? (p.contractAmount || 0) : 0) : (p.contractAmount || 0);
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
    const { instructorNameMap, companyNameMap } = await fetchNameMaps();
    return buildProject(r, r.clients?.name ?? '', r.users?.name ?? r.users?.email ?? '', costMap.get(r.id) ?? [], instructorNameMap, companyNameMap);
  }

  // 수기 프로젝트 신규 생성 (기존에는 노션 pull·그룹 회차 생성만 가능해 화면에서 프로젝트를 만들 수 없었음)
  async createProject(input: {
    projectName: string; clientName: string; finalEstimate: number;
    revenueMonth?: string; startDate?: string; status?: string;
  }): Promise<string> {
    const clientId = await this.findOrCreateClient(input.clientName.trim());
    const { data, error } = await supabase.from('projects').insert({
      project_name: input.projectName.trim(),
      client_id: clientId,
      status: input.status ?? '요청/담당',
      final_estimate: input.finalEstimate,
      vat_type: '별도',
      revenue_month: input.revenueMonth || null,
      session_1_date: input.startDate || null,
      source_type: 'manual_groupware',
    }).select('id').single();
    if (error) throw error;
    return String(data.id);
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
    if ('clientPaymentMemo' in patch) dbPatch.client_payment_memo = patch.clientPaymentMemo || null;
    if (patch.prepChecklist !== undefined) dbPatch.prep_checklist = patch.prepChecklist;
    if ('masterClientName' in patch) dbPatch.master_client_name = patch.masterClientName || null;
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;
    // 상태 변경 (수기 프로젝트 수명주기 관리 — DB 원본 상태 8종 그대로 저장)
    if (patch.dbStatus !== undefined) dbPatch.status = patch.dbStatus;
    // 그룹 자식(노션 미연동) 금액·시행일 수정 지원 — 금액은 세전(final_estimate) 기준
    if (patch.finalEstimate !== undefined) dbPatch.final_estimate = patch.finalEstimate;
    // 회차명 수정 (그룹웨어 생성 자식 전용 — 노션 연동 프로젝트 이름은 노션이 원천이라 여기서 수정 금지)
    if (patch.projectName !== undefined) dbPatch.project_name = patch.projectName;
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
      notionMissing: !!r.notion_missing,
      expertise: r.lecture_topics ?? [],
      phone: r.contact ?? undefined,
      email: r.email ?? undefined,
      defaultFee: Number(r.fee_basis ?? 0),
      accountInfo: r.bank_name && r.account_number ? `${r.bank_name} ${r.account_number}` : undefined,
      bankName: r.bank_name ?? undefined,
      accountNumber: r.account_number ?? undefined,
      residentNumber: r.resident_number ?? undefined,
      address: r.address ?? undefined,
      // 과거 강사DB 프로필 필드 — DB에는 있었지만 매핑 누락으로 화면에서 '누락'처럼 보이던 것 복원
      specialty: r.specialty ?? undefined,
      level: r.level ?? undefined,
      career: r.career ?? undefined,
      education: r.education ?? undefined,
      honorific: r.honorific ?? undefined,
      remarks: r.remarks ?? undefined,
      specialNotes: r.special_notes ?? undefined,
      memo: r.remarks ?? undefined,
    }));
  }

  async addInstructor(input: Omit<Instructor, 'id'>): Promise<string> {
    const { data, error } = await supabase.from('instructors').insert({
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
    }).select('id').single();
    if (error) throw error;
    return String(data.id);
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
    const { data, error } = await supabase.from('instructors').delete().eq('id', Number(id)).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('삭제되지 않았습니다 — 관리자 권한이 필요합니다.');
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

  async addCompany(input: Omit<Company, 'id'>): Promise<string> {
    const { data, error } = await supabase.from('companies').insert({
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
    }).select('id').single();
    if (error) throw error;
    return String(data.id);
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
    const { data, error } = await supabase.from('companies').delete().eq('id', Number(id)).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('삭제되지 않았습니다 — 관리자 권한이 필요합니다.');
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
      avgPaymentLagDays: r.avg_payment_lag_days ?? undefined,
      paymentLagSampleCount: r.payment_lag_sample_count ?? undefined,
      paymentLagUpdatedAt: r.payment_lag_updated_at ?? undefined,
    }));
  }

  /** 고객사별 입금 리드타임 재분석 실행 (설정 화면 버튼에서 호출) */
  async recomputeClientPaymentLag(): Promise<number> {
    const { data, error } = await supabase.rpc('recompute_client_payment_lag');
    if (error) throw error;
    return (data?.[0]?.updated_count as number) ?? 0;
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

  /** 'YYYY-MM' → 해당 월 말일 'YYYY-MM-DD' */
  private static endOfMonth(month: string): string {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${month}-${String(last).padStart(2, '0')}`;
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
        clientName: r.projects?.clients?.name ?? undefined,
        // 구 지급확인 '입금/세발' 컬럼: 지급 판단에 필수인 프로젝트 수금·계산서 상태
        projectPaymentReceived: !!r.projects?.client_payment_received,
        projectTaxInvoiceIssued: !!r.projects?.is_tax_invoice_issued,
        projectStartDate: r.projects?.session_1_date ?? undefined,
        payeeType: r.payee_type === 'instructor' ? '강사' : r.payee_type === 'company' ? '업체' : '기타',
        payeeName: r.payee_name ?? '',
        // 실지급액(actual_payment_amount)은 미지급 건에서 항상 0으로 초기화되어 있어,
        // 무조건 ??(nullish) 우선순위를 쓰면 예산금액이 있어도 0으로 표시되는 버그가 있었음(169건 영향).
        // 지급완료 건만 실지급액을 우선하고, 그 외에는 예산금액을 그대로 보여준다.
        amount: Number(r.status === '지급완료' ? (r.actual_payment_amount ?? r.budget_amount ?? 0) : (r.budget_amount ?? r.actual_payment_amount ?? 0)),
        // 예정일 = 지급 '예약월'의 말일. 구 업무는 월말 일괄 지급 배치 방식이라 예약이 없으면 예정일도 없다
        // (과거: 시행일 익월말일을 자동 부여 → 예정 개념이 없던 과거 건 전체가 '연체'로 표기되는 문제)
        dueDate: r.status === '지급완료' ? (r.paid_month ?? '')
          : r.payment_scheduled_month ? SupabaseDataSource.endOfMonth(r.payment_scheduled_month) : undefined,
        scheduledMonth: r.payment_scheduled_month ?? undefined,
        status: SupabaseDataSource.dbCostStatusToFrontend(r.status),
        memo: r.remarks ?? undefined,
        costType: r.category ?? undefined,
        isCardPayment: !!r.is_card_payment,
        isPayable: r.is_payable !== false,
        taxMode: r.tax_mode ?? 'rate33',
        manualIncomeTax: Number(r.manual_income_tax ?? 0),
        manualResidentTax: Number(r.manual_resident_tax ?? 0),
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
        createdMonth: r.created_at ? String(r.created_at).slice(0, 7) : undefined,
      } as PaymentRequest;
    });
  }

  async getPaymentRequests(): Promise<PaymentRequest[]> {
    const { data, error } = await supabase
      .from('project_costs')
      .select('*, projects(project_name, session_1_date, client_payment_received, is_tax_invoice_issued, clients(name))')
      // 카드/비지급 제외는 화면별 정책이 달라(예산탭=표시, 지급관리=제외) 프론트에서 필터한다
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.buildPaymentRequests(data ?? []);
  }

  async updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      dbPatch.status = SupabaseDataSource.frontendStatusToDbCostStatus(patch.status);
      // 지급월: 사용자가 선택한 값 우선(소급 처리 지원), 미지정 시 현재 월
      if (patch.status === '지급완료') {
        dbPatch.paid_month = patch.paidMonth ?? new Date().toISOString().slice(0, 7);
        // 실지급액(actual_payment_amount) 자동 계산 — 강사는 원천징수(3.3%/8.8%/수동) 후 순액,
        // 업체·기타는 예산금액 그대로. 이 필드를 저장하는 곳이 이전엔 없어서
        // 신규로 지급완료 처리되는 건이 계속 0으로 남는 문제가 있었음(과거 데이터는 별도 이관값 보유).
        const { data: cur } = await supabase.from('project_costs')
          .select('payee_type, budget_amount, tax_mode, manual_income_tax, manual_resident_tax')
          .eq('id', Number(id)).maybeSingle();
        if (cur) {
          const payeeTypeKo = cur.payee_type === 'instructor' ? '강사' : cur.payee_type === 'company' ? '업체' : '기타';
          const w = calcWithholdingFor({
            payeeType: payeeTypeKo,
            amount: Number(patch.amount ?? cur.budget_amount ?? 0),
            taxMode: patch.taxMode ?? cur.tax_mode ?? undefined,
            manualIncomeTax: patch.manualIncomeTax ?? cur.manual_income_tax ?? undefined,
            manualResidentTax: patch.manualResidentTax ?? cur.manual_resident_tax ?? undefined,
          });
          dbPatch.actual_payment_amount = w.netAmount;
        }
      }
      // 지급취소(완료 → 요청 되돌리기) 시 지급월 해제
      if (patch.status === '지급요청') dbPatch.paid_month = null;
    }
    if (patch.infoConfirmed !== undefined) dbPatch.payment_info_confirmed = patch.infoConfirmed;
    // 지급 상세: 세금 방식 (구 그룹웨어 3.3/8.8/용역수동 이식)
    if (patch.taxMode !== undefined) dbPatch.tax_mode = patch.taxMode;
    if (patch.manualIncomeTax !== undefined) dbPatch.manual_income_tax = patch.manualIncomeTax;
    if (patch.manualResidentTax !== undefined) dbPatch.manual_resident_tax = patch.manualResidentTax;
    // 지급대상 연결(미연결 건 수동 연결용) — 계좌정보 조인의 전제 조건
    if (patch.payeeId !== undefined) dbPatch.payee_id = patch.payeeId ? Number(patch.payeeId) : null;
    // 대상 재연결 시 표시 이름도 함께 갱신 (누락 시 계좌만 바뀌고 화면 이름은 그대로 남아 "반영 안 됨"처럼 보이던 버그)
    if (patch.payeeName !== undefined) dbPatch.payee_name = patch.payeeName;
    // 지급월 예약 (해당 월 말일 일괄 지급 배치 대상)
    if ('scheduledMonth' in patch) dbPatch.payment_scheduled_month = patch.scheduledMonth ?? null;
    if (patch.vendorTaxInvoiceReceived !== undefined) dbPatch.vendor_tax_invoice_received = patch.vendorTaxInvoiceReceived;
    if ('vendorTaxInvoiceDate' in patch) dbPatch.vendor_tax_invoice_date = patch.vendorTaxInvoiceDate ?? null;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from('project_costs').update(dbPatch).eq('id', Number(id));
      if (error) throw error;
    }
    const { data: r, error: fetchErr } = await supabase
      .from('project_costs').select('*, projects(project_name, session_1_date, client_payment_received, is_tax_invoice_issued, clients(name))').eq('id', Number(id)).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!r) return undefined;
    const [built] = await this.buildPaymentRequests([r]);
    return built;
  }

  async deleteProjectCost(id: string): Promise<void> {
    // .select('id')로 실제 삭제된 행을 확인 — RLS 정책에 안 맞으면 에러 없이 "0건 삭제"로
    // 조용히 통과되는 경우가 있어(2026-07-16 발견), 0건이면 명시적으로 실패 처리한다.
    const { data, error } = await supabase.from('project_costs').delete().eq('id', Number(id)).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('삭제되지 않았습니다 — 로그인 상태를 확인해주세요.');
  }

  // 예산항목 수정 (기존: 추가/삭제만 가능 — 오타·금액 정정 시 삭제 후 재입력해야 했던 불편 해소)
  // 노션 원본이 삭제된 프로젝트의 최종 삭제 — 예산 항목은 함께 삭제(CASCADE),
  // 그룹 자식·지급이력이 참조 중이면 DB 제약이 막으므로 오류 메시지로 안내된다.
  // 삭제 권한: 활성 로그인 사용자 전체(관리자 한정 아님, 2026-07-16 정책 변경)
  async deleteProject(id: string): Promise<void> {
    // .select('id')로 실제 삭제된 행을 받아온다 — RLS 정책에 걸리면 Supabase는 에러 없이
    // "0건 삭제"로 조용히 넘어가서, 화면은 성공한 것처럼 보이지만 실제로는 아무것도 지워지지
    // 않고 다음에 다시 열면 그대로 남아있는 문제가 있었다(2026-07-16 발견 및 수정).
    const { data, error } = await supabase.from('projects').delete().eq('id', Number(id)).select('id');
    if (error) {
      if (error.code === '23503') throw new Error('이 프로젝트를 참조하는 데이터(그룹 구성, 지급 이력 등)가 있어 삭제할 수 없습니다. 구성 해제 후 다시 시도하세요.');
      throw error;
    }
    if (!data || data.length === 0) throw new Error('삭제되지 않았습니다 — 로그인 상태를 확인해주세요.');
  }

  async recoverNotionLink(id: string): Promise<void> {
    // 노션 원본이 삭제된 경우 복구: 기존 연결을 끊고 현재 그룹웨어 데이터로 노션에 새 페이지를 재생성한다
    // (원래 페이지가 되살아나는 것이 아니라, 현재 데이터 기준의 새 페이지가 만들어진다)
    const { error: updErr } = await supabase.from('projects').update({
      notion_page_id: null, notion_missing: false, notion_missing_checked_at: new Date().toISOString(),
    }).eq('id', Number(id));
    if (updErr) throw updErr;
    const { error: qErr } = await supabase.from('notion_push_queue').insert({
      entity_type: 'project', entity_id: Number(id), status: 'pending',
    });
    if (qErr) throw qErr;
  }

  async updateProjectCost(costId: string, patch: {
    payeeName?: string; budgetAmount?: number; remarks?: string;
    payeeType?: 'instructor' | 'company' | 'etc'; payeeId?: string | null;
    isCardPayment?: boolean; category?: string;
  }): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.payeeName !== undefined) dbPatch.payee_name = patch.payeeName;
    if (patch.budgetAmount !== undefined) dbPatch.budget_amount = patch.budgetAmount;
    if (patch.remarks !== undefined) dbPatch.remarks = patch.remarks;
    if (patch.payeeType !== undefined) dbPatch.payee_type = patch.payeeType !== 'etc' ? patch.payeeType : null;
    if ('payeeId' in patch) dbPatch.payee_id = patch.payeeId ? Number(patch.payeeId) : null;
    if (patch.isCardPayment !== undefined) dbPatch.is_card_payment = patch.isCardPayment;
    // is_payable = 카드결제가 아니고, 지급대상 유형이 강사/업체인 경우에만 true.
    // '기타(직접입력)'는 계좌·사업자 정보가 없는 메모성 항목이라 지급관리(지급대상/지급요청) 대상에서 제외한다.
    if (patch.isCardPayment !== undefined || patch.payeeType !== undefined) {
      let type = patch.payeeType;
      let card = patch.isCardPayment;
      if (type === undefined || card === undefined) {
        const { data: cur } = await supabase.from('project_costs').select('payee_type, is_card_payment').eq('id', Number(costId)).maybeSingle();
        if (type === undefined) type = cur?.payee_type === 'instructor' ? 'instructor' : cur?.payee_type === 'company' ? 'company' : 'etc';
        if (card === undefined) card = !!cur?.is_card_payment;
      }
      dbPatch.is_payable = !card && (type === 'instructor' || type === 'company');
    }
    if (patch.category !== undefined) dbPatch.category = patch.category;
    const { error } = await supabase.from('project_costs').update(dbPatch).eq('id', Number(costId));
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
      // '기타(직접입력)'는 강사/업체 DB에 연결되지 않는 메모성 항목이라 지급관리 대상(is_payable)에서 제외한다.
      is_payable: !(input.isCardPayment ?? false) && (input.payeeType === 'instructor' || input.payeeType === 'company'),
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
    const { data, error } = await supabase.from('notion_field_mappings').delete().eq('id', Number(id)).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('삭제되지 않았습니다 — 권한을 확인해주세요.');
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
    groupType: 'recurring';
    projectName: string;
    amount: number;
    executionDate?: string;      // recurring 회차 시행일
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
    if (masterRow.parent_id != null) throw new Error('현재 프로젝트가 이미 다른 그룹의 구성입니다. 화면을 새로고침한 뒤 소속 그룹에서 해제 후 시도하세요.');

    // 가드: 동일 이름(회차) 자식 중복 방지 (#5)
    const { data: dup } = await supabase.from('projects')
      .select('id').eq('parent_id', Number(masterId)).eq('project_name', input.projectName).limit(1);
    if (dup && dup.length > 0) throw new Error(`동일한 구성("${input.projectName}")이 이미 존재합니다. 회차 번호를 확인하세요.`);

    // 회차 자식은 그룹웨어 내부에서만 관리 — 노션에는 동기화하지 않는다 (2026-07-08 정책 확정, DB 트리거에서도 차단)
    const { error } = await supabase.from('projects').insert({
      project_name: input.projectName,
      client_id: input.masterClientId ? Number(input.masterClientId) : null,
      parent_id: Number(masterId),
      is_master: false,
      group_type: input.groupType,
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

  // ── 매출분배(계열사) 관리 — revenue_distributions 전용 테이블, projects와 완전히 분리 ──
  // 마스터는 group_type='distribution'/is_master=true 로 표시되지만 자식 프로젝트를 만들지 않는다.
  // 전 계열사가 세금계산서·입금 완료되면 DB 트리거가 마스터에 자동 반영하고, 그 값이 노션과 동기화된다.
  private static mapDistribution(r: any): RevenueDistribution {
    return {
      id: String(r.id), projectId: String(r.project_id), clientName: r.client_name,
      amount: Number(r.amount ?? 0), distributionRatio: r.distribution_ratio != null ? Number(r.distribution_ratio) : undefined,
      taxInvoiceIssued: !!r.tax_invoice_issued, taxInvoiceDate: r.tax_invoice_date ?? undefined,
      paymentReceived: !!r.payment_received, paymentDate: r.payment_date ?? undefined,
      sortOrder: r.sort_order ?? 0,
    };
  }

  async getDistributions(projectId: string): Promise<RevenueDistribution[]> {
    const { data, error } = await supabase.from('revenue_distributions')
      .select('*').eq('project_id', Number(projectId)).order('sort_order');
    if (error) throw error;
    return (data ?? []).map(SupabaseDataSource.mapDistribution);
  }

  async addDistribution(masterId: string, input: { clientName: string; amount: number; distributionRatio?: number }): Promise<void> {
    if (!input.clientName.trim()) throw new Error('계열사명을 입력하세요.');
    const { data: existing } = await supabase.from('revenue_distributions')
      .select('id, sort_order').eq('project_id', Number(masterId)).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 1;
    const { error } = await supabase.from('revenue_distributions').insert({
      project_id: Number(masterId), client_name: input.clientName.trim(),
      amount: input.amount, distribution_ratio: input.distributionRatio ?? null,
      sort_order: nextOrder,
    });
    if (error) throw error;
    // 마스터를 매출분배 유형으로 표시 (최초 1건 추가 시)
    const { data: masterRow } = await supabase.from('projects').select('group_type').eq('id', Number(masterId)).maybeSingle();
    if (masterRow && !masterRow.group_type) {
      await supabase.from('projects').update({ is_master: true, group_type: 'distribution' }).eq('id', Number(masterId));
    }
  }

  async updateDistribution(id: string, patch: Partial<Pick<RevenueDistribution, 'clientName' | 'amount' | 'distributionRatio' | 'taxInvoiceIssued' | 'taxInvoiceDate' | 'paymentReceived' | 'paymentDate'>>): Promise<void> {
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.clientName !== undefined) dbPatch.client_name = patch.clientName;
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.distributionRatio !== undefined) dbPatch.distribution_ratio = patch.distributionRatio;
    if (patch.taxInvoiceIssued !== undefined) dbPatch.tax_invoice_issued = patch.taxInvoiceIssued;
    if ('taxInvoiceDate' in patch) dbPatch.tax_invoice_date = patch.taxInvoiceDate ?? null;
    if (patch.paymentReceived !== undefined) dbPatch.payment_received = patch.paymentReceived;
    if ('paymentDate' in patch) dbPatch.payment_date = patch.paymentDate ?? null;
    const { error } = await supabase.from('revenue_distributions').update(dbPatch).eq('id', Number(id));
    if (error) throw error;
  }

  async deleteDistribution(id: string): Promise<void> {
    const { data: row } = await supabase.from('revenue_distributions').select('project_id').eq('id', Number(id)).maybeSingle();
    const { data: deleted, error } = await supabase.from('revenue_distributions').delete().eq('id', Number(id)).select('id');
    if (error) throw error;
    if (!deleted || deleted.length === 0) throw new Error('삭제되지 않았습니다 — 권한을 확인해주세요.');
    if (row) {
      const { data: rest } = await supabase.from('revenue_distributions').select('id').eq('project_id', row.project_id).limit(1);
      if (!rest || rest.length === 0) {
        await supabase.from('projects').update({ group_type: null }).eq('id', row.project_id);
      }
    }
  }

  /** 기존 프로젝트들을 마스터 아래로 묶기 (merged) */
  async attachProjectsToGroup(masterId: string, childIds: string[], groupType: 'merged' | 'recurring' = 'merged'): Promise<void> {
    // 가드 (#4): 자기 자신 금지 / 마스터가 이미 자식이면 금지 / 대상이 이미 자식이거나 자식을 가진 마스터면 금지 (중첩·순환 차단)
    if (childIds.includes(masterId)) throw new Error('자기 자신을 그룹에 묶을 수 없습니다.');
    const { data: masterRow } = await supabase.from('projects').select('id, parent_id').eq('id', Number(masterId)).maybeSingle();
    if (!masterRow) throw new Error('마스터 프로젝트를 찾을 수 없습니다.');
    if (masterRow.parent_id != null) throw new Error('현재 프로젝트가 이미 다른 그룹의 구성입니다. 화면을 새로고침한 뒤 소속 그룹에서 해제 후 시도하세요.');
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
    const { data: deleted, error } = await supabase.from('projects').delete().eq('id', idNum).select('id');
    if (error) throw error;
    if (!deleted || deleted.length === 0) throw new Error('삭제되지 않았습니다 — 로그인 상태를 확인해주세요.');
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
    // 동기화 시각은 실제 pull 커서(sync_state) 기준 — 변경 로그 최신행 기준이면
    // '변경이 없던 기간'이 통째로 미동기화처럼 보이는 오표시가 난다
    const { data: cursor } = await supabase
      .from('sync_state').select('value').eq('key', 'pull_cursor_project').maybeSingle();
    const cursorAt = cursor?.value ? String(cursor.value).replace(/^"|"$/g, '') : undefined;
    return {
      status: 'synced',
      lastSyncedAt: cursorAt,
      syncedCount: count ?? 0,
      message: '노션 자동 동기화 (pull 커서 기준)',
    };
  }
}

export const supabaseDataSource: DataSource = new SupabaseDataSource();
