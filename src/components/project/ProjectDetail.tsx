import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import type { Project, PaymentRequest, PrepItem } from '../../types';
import { OverviewTab } from './tabs/OverviewTab';
import { OperationTab } from './tabs/OperationTab';
import { RevenueTab } from './tabs/RevenueTab';
import { BudgetTab } from './tabs/BudgetTab';
import { PaymentTab } from './tabs/PaymentTab';
import { SettlementTab } from './tabs/SettlementTab';
import { HistoryTab } from './tabs/HistoryTab';
import { StatusBadge } from '../common/StatusBadge';
import { projectStatusStyle } from '../../utils/statusConfig';
import { ChevronLeft, RefreshCw } from 'lucide-react';

const TABS = ['개요', '운영', '매출', '예산/비용', '지급', '정산/결산', '히스토리'] as const;
type Tab = typeof TABS[number];

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, instructors, paymentRequests, loading, updateProject, updatePaymentRequest } = useAppData();
  const [activeTab, setActiveTab] = useState<Tab>('개요');
  const [saving, setSaving] = useState(false);

  const project = projects.find((p) => p.id === id);

  useEffect(() => {
    if (!loading && !project) navigate('/projects', { replace: true });
  }, [loading, project, navigate]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  if (!project) return null;

  const handleUpdate = async (patch: Partial<Project>) => {
    setSaving(true);
    await updateProject(project.id, patch);
    setSaving(false);
  };

  const handleTogglePrep = async (prepId: string) => {
    const newItems = project.prepItems.map((item: PrepItem) =>
      item.id === prepId ? { ...item, completed: !item.completed } : item,
    );
    await handleUpdate({ prepItems: newItems });
  };

  const handleUpdateRequest = async (rid: string, patch: Partial<PaymentRequest>) => {
    setSaving(true);
    await updatePaymentRequest(rid, patch);
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
            <StatusBadge label={project.projectStatus} style={projectStatusStyle[project.projectStatus]} />
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
          <p className="mt-0.5 text-sm text-slate-500">{project.clientName} · {project.managerName} · {project.startDate}</p>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <nav className="flex overflow-x-auto border-b border-slate-200 px-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} className={tabBtnCls(t)}>{t}</button>
          ))}
        </nav>

        {/* 탭 콘텐츠 */}
        <div className="p-4 lg:p-6">
          {activeTab === '개요' && <OverviewTab project={project} instructors={instructors} />}
          {activeTab === '운영' && <OperationTab project={project} onTogglePrep={handleTogglePrep} />}
          {activeTab === '매출' && <RevenueTab project={project} onUpdate={handleUpdate} />}
          {activeTab === '예산/비용' && <BudgetTab project={project} />}
          {activeTab === '지급' && (
            <PaymentTab project={project} requests={paymentRequests} onUpdateRequest={handleUpdateRequest} />
          )}
          {activeTab === '정산/결산' && <SettlementTab project={project} onUpdate={handleUpdate} />}
          {activeTab === '히스토리' && <HistoryTab project={project} />}
        </div>
      </div>
    </div>
  );
}
