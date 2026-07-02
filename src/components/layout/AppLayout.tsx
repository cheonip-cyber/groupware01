import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const titleMap: Record<string, string> = {
  '/': 'Dashboard', '/projects': '프로젝트', '/revenue': '매출/계약', '/budget': '예산/비용',
  '/payments': '지급관리', '/settlement': '정산/결산', '/instructors': '강사관리',
  '/clients': '고객사/거래처', '/reports': '리포트', '/settings': '설정',
  '/admin/card': '카드사용 관리', '/admin/sga': '판관비 관리',
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const title = titleMap[pathname] ?? (pathname.startsWith('/projects/') ? '프로젝트 상세' : 'SAM.SOTTA');
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-auto p-4 lg:p-7">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
