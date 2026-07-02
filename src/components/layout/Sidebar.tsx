import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Receipt, Wallet, CreditCard,
  ClipboardCheck, Users, Building2, BarChart3, Settings, X, PiggyBank, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: '프로젝트', icon: FolderKanban },
  { to: '/revenue', label: '매출/계약', icon: Receipt },
  { to: '/budget', label: '예산/비용', icon: Wallet },
  { to: '/payments', label: '지급관리', icon: CreditCard },
  { to: '/settlement', label: '정산/결산', icon: ClipboardCheck },
  { to: '/instructors', label: '강사관리', icon: Users },
  { to: '/clients', label: '고객사/거래처', icon: Building2 },
  { to: '/companies', label: '업체관리', icon: Building2 },
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/settings', label: '설정', icon: Settings },
];

// 관리자 전용 메뉴 — isAdmin일 때만 노출
const adminItems = [
  { to: '/admin/card', label: '카드사용 관리', icon: CreditCard },
  { to: '/admin/sga', label: '판관비 관리', icon: PiggyBank },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAdmin } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-slate-900 text-slate-300 transition-transform duration-300 lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-lg font-bold tracking-tight text-white">SAM<span className="text-blue-400">.</span>SOTTA</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-500">Groupware</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={onClose}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              <it.icon className="h-[18px] w-[18px]" />{it.label}
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div className="mt-3 flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" /> 관리자
              </div>
              {adminItems.map((it) => (
                <NavLink key={it.to} to={it.to} onClick={onClose}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                  <it.icon className="h-[18px] w-[18px]" />{it.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-slate-800 px-5 py-3 text-center text-[11px] text-slate-500">
          샘플 데이터 모드 · v0.1
        </div>
      </aside>
    </>
  );
}
