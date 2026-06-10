import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ProjectListPage } from './components/project/ProjectListPage';
import { ProjectDetail } from './components/project/ProjectDetail';
import { RevenuePage } from './components/pages/RevenuePage';
import { BudgetPage } from './components/pages/BudgetPage';
import { PaymentsPage } from './components/pages/PaymentsPage';
import { SettlementPage } from './components/pages/SettlementPage';
import { InstructorsPage } from './components/pages/InstructorsPage';
import { ClientsPage } from './components/pages/ClientsPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SettingsPage } from './components/pages/SettingsPage';

// ErrorBoundary: 런타임 에러를 빈화면이 아니라 메시지로 표시
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-8">
          <div className="max-w-lg rounded-xl border border-red-200 bg-white p-8 shadow-lg">
            <h2 className="mb-2 text-lg font-bold text-red-700">오류가 발생했습니다</h2>
            <pre className="overflow-auto rounded bg-red-50 p-4 text-xs text-red-600">
              {this.state.error.message}
            </pre>
            <button onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/settlement" element={<SettlementPage />} />
          <Route path="/instructors" element={<InstructorsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </AppLayout>
    </ErrorBoundary>
  );
}
