import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import type { Project, PaymentRequest } from '../../types';
import type { NewProjectCostInput } from '../../services/dataSource';
import { OverviewTab } from './tabs/OverviewTab';
import { OperationTab } from './tabs/OperationTab';
import { RevenueTab } from './tabs/RevenueTab';
import { BudgetTab } from './tabs/BudgetTab';
import { PaymentTab } from './tabs/PaymentTab';
import { SettlementTab } from './tabs/SettlementTab';
import { HistoryTab } from './tabs/HistoryTab';
import { GroupSection } from './GroupSection';
import { StatusBadge } from '../common/StatusBadge';
import { MoneyText } from '../common/MoneyText';
import { projectStatusStyle } from '../../utils/statusConfig';
import { ChevronLeft, RefreshCw } from 'lucide-react';

// 순서: 요청사항 4 — "정산/결산 컬럼 이후 순서로 지급 배치"
const TABS = ['개요', '운영', '매출', '예산/비용', '정산/결산', '지급', '히스토리'] as const;
type Tab = typeof TABS[number];

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    projects, instructors, companies, clients, paymentRequests, loading,
    refresh, updateProject, updatePaymentRequest, addProjectCost, updateProjectCost, deleteProjectCost, recoverNotionLink, deleteProject,
    addInstructor, addCompany,
  } = useAppData();
  const [activeTab, setActiveTab] = useState<Tab>('개요');
  const [saving, setSaving] = useState(false);

  const project = projects.find((p) => p.id === id);
  const projectRequests = paymentRequests.filter((r) => r.projectId === id);

  useEffect(() => {
    if (!loading && !project) navigate('/projects', { replace: true });
  }, [loading, project, navigate]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  if (!project) return null;

  const handleUpdate = async (patch: Partial<Project>) => {
    setSaving(true);
    try {
      await updateProject(project.id, patch);
    } catch (e) {
      console.error(e);
      // 실패 시 사용자에게 알리고 로딩 상태를 반드시 해제한다 (무한 "저장 중" 방지)
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRequest = async (rid: string, patch: Partial<PaymentRequest>) => {
    setSaving(true);
    try {
      await updatePaymentRequest(rid, patch);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCost = async (input: NewProjectCostInput) => {
    setSaving(true);
    await addProjectCost(project.id, input);
    setSaving(false);
  };

  const handleDeleteCost = async (costId: string) => {
    setSaving(true);
    await deleteProjectCost(costId);
    setSaving(false);
  };

  const tabBtnCls = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
      activeTab === t
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-slate-500 hover:text-slate-800'
    }`;

  return (
    <div className="space-y-4">
      {/* 상단 헤더 */}
      <div className="flex items-start gap-3">
        <Link to="/projects"
          className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200">
          <ChevronLeft className="h-4 w-4" /> 목록
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 lg:text-xl">{project.projectName}</h2>
            {project.notionPageId ? (
            <span title="노션 연동 프로젝트 — 상태는 노션에서 관리됩니다">
              <StatusBadge label={project.projectStatus} style={projectStatusStyle[project.projectStatus]} />
            </span>
          ) : (
            <select
              value={project.dbStatus ?? '요청/담당'}
              onChange={(e) => updateProject(project.id, { dbStatus: e.target.value })}
              title="프로젝트 상태 변경 (수기 프로젝트)"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400">
              {['요청/담당', '제안/PT', '확정/준비', '준비', '운영/모니터링', '보고/정산', '종료(수익화 완료)', '취소/보류'].map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}
            {project.riskFlags.length > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                ⚠ {project.riskFlags.join(' · ')}
              </span>
            )}
            {saving && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <RefreshCw className="h-3 w-3 animate-spin" /> 저장 중…
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {project.clientName} · {project.managerName} · {project.startDate}
            <span className="ml-2 font-semibold text-slate-700"><MoneyText value={project.contractAmount} /></span>
            {project.revenueMonth && <span className="ml-1.5 text-xs text-slate-400">매출월 {project.revenueMonth}</span>}
          </p>
        </div>
      </div>

      {/* 자금 진행 스테퍼 + 다음 액션: 어느 탭에 있든 프로젝트의 자금 위치가 한눈에 보이도록 */}
      <FundStepper project={project} requests={projectRequests} onGoTab={(t) => setActiveTab(t)} />

      {/* 탭 네비게이션 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <nav className="flex overflow-x-auto border-b border-slate-200 px-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} className={tabBtnCls(t)}>{t}</button>
          ))}
        </nav>

        {/* 탭 콘텐츠 */}
        <div className="p-4 lg:p-6">
          {activeTab === '개요' && (
            <div className="space-y-4">
              <GroupSection project={project} allProjects={projects} onChanged={refresh} />
              <OverviewTab project={project} instructors={instructors} clients={clients} onUpdate={handleUpdate}
                onGoBudgetTab={() => setActiveTab('예산/비용')}
                onRecover={() => recoverNotionLink(project.id)}
                onDelete={async () => {
                  try { await deleteProject(project.id); navigate('/projects'); }
                  catch (e) { alert(e instanceof Error ? e.message : String(e)); }
                }} />
            </div>
          )}
          {activeTab === '운영' && <OperationTab project={project} onUpdate={handleUpdate} />}
          {activeTab === '매출' && <RevenueTab project={project} onUpdate={handleUpdate} />}
          {activeTab === '예산/비용' && (
            <BudgetTab
              project={project}
              requests={projectRequests}
              instructors={instructors}
              companies={companies}
              onAddCost={handleAddCost}
              onUpdateCost={updateProjectCost}
              onDeleteCost={handleDeleteCost}
              addInstructor={addInstructor}
              addCompany={addCompany}
            />
          )}
          {activeTab === '정산/결산' && <SettlementTab project={project} requests={projectRequests} onUpdate={handleUpdate} />}
          {activeTab === '지급' && (
            <PaymentTab project={project} requests={projectRequests} onUpdateRequest={handleUpdateRequest} />
          )}
          {activeTab === '히스토리' && <HistoryTab project={project} />}
        </div>
      </div>
    </div>
  );
}

// ── 자금 5단계 스테퍼(견적→계산서→입금→지급→결산) + 상태 기반 '다음 액션' ──
function FundStepper({ project, requests, onGoTab }: {
  project: Project;
  requests: PaymentRequest[];
  onGoTab: (t: Tab) => void;
}) {
  const payDone = requests.length > 0 && requests.every((r) => r.status === '지급완료');
  const steps = [
    { label: '견적', done: project.contractAmount > 0 },
    { label: '계산서 발행', done: project.taxInvoiceIssued },
    { label: '입금', done: project.collectionCompleted },
    { label: '지급', done: payDone },
    { label: '결산', done: project.settlementStatus === '결산완료' },
  ];

  // 다음 액션: 현재 상태에서 지금 해야 할 일 하나를 제시 (구 시스템 '미요청 배지' 철학의 상세 화면 확장)
  const pendingPay = requests.filter((r) => r.status !== '지급완료').length;
  const next = project.projectStatus === '취소/보류' ? null
    : !project.taxInvoiceIssued && ['확정/준비', '운영중', '보고/정산', '완료'].includes(project.projectStatus)
      ? { label: '세금계산서 발행 확인', tab: '매출' as Tab }
    : project.taxInvoiceIssued && !project.collectionCompleted
      ? { label: '입금 확인', tab: '매출' as Tab }
    : project.collectionCompleted && pendingPay > 0
      ? { label: `지급 처리 (${pendingPay}건 대기)`, tab: '지급' as Tab }
    : project.collectionCompleted && payDone && project.settlementStatus !== '결산완료'
      ? { label: '결산 처리', tab: '정산/결산' as Tab }
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {steps.map((st, i) => (
          <li key={st.label} className="flex items-center gap-1.5">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${
              st.done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-slate-50 text-slate-400 ring-slate-200'}`}>
              {st.done ? '✓' : i + 1}
            </span>
            <span className={`text-xs ${st.done ? 'font-medium text-slate-700' : 'text-slate-400'}`}>{st.label}</span>
            {i < steps.length - 1 && <span className={`h-px w-4 ${st.done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </li>
        ))}
      </ol>
      {next && (
        <button onClick={() => onGoTab(next.tab)}
          className="ml-auto flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
          다음 액션: {next.label} →
        </button>
      )}
    </div>
  );
}
