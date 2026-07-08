import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Receipt, Wallet, CreditCard,
  ClipboardCheck, Users, Building2, BarChart3, Settings, X, PiggyBank, ShieldCheck, Landmark,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

// 업무 — 프로젝트 파이프라인 관련 메뉴
const workItems = [
  { to: '/projects', label: '프로젝트', icon: FolderKanban },
  { to: '/revenue', label: '매출/계약', icon: Receipt },
  { to: '/budget', label: '예산/비용', icon: Wallet },
  { to: '/payments', label: '지급관리', icon: CreditCard },
  { to: '/settlement', label: '정산/결산', icon: ClipboardCheck },
];

// 자산·관계 — 강사/업체/카드 등 참조 데이터
const assetItems = [
  { to: '/instructors', label: '강사관리', icon: Users },
  { to: '/companies', label: '업체관리', icon: Building2 },
  { to: '/my-cards', label: '카드사용내역', icon: CreditCard },
];

// 분석·설정
const insightItems = [
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/settings', label: '설정', icon: Settings },
];

// 관리자 전용 메뉴 — isAdmin일 때만 노출
const adminItems = [
  { to: '/admin/overview', label: '경영 현황', icon: Landmark },
  { to: '/admin/card', label: '카드사용 관리', icon: CreditCard },
  { to: '/admin/sga', label: '판관비 관리', icon: PiggyBank },
];

function NavGroup({ eyebrow, items, onClose }: { eyebrow?: string; items: typeof workItems; onClose: () => void }) {
  return (
    <div className="mb-1">
      {eyebrow && (
        <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/35">{eyebrow}</div>
      )}
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} onClick={onClose}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm font-medium transition-colors ${
              isActive ? 'bg-ink-900 text-white' : 'text-white/60 hover:bg-ink-900 hover:text-white'
            }`
          }>
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-600" />}
              <it.icon className={`h-[18px] w-[18px] ${isActive ? 'text-brand-400' : ''}`} />
              {it.label}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, isAdmin } = useAuth();
  const displayName = profile?.name || profile?.email?.split('@')[0] || '사용자';
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ink-950 text-white/70 transition-transform duration-300 lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-lg font-bold tracking-tight text-white">
              SAM<span className="dot dot-pulse mx-0.5 inline-block h-[5px] w-[5px] align-middle" style={{ '--dot-color': '#8FACF3' } as CSSProperties} />SOTTA
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-white/35">Groupware</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-white/50 hover:bg-ink-900 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          <NavLink to="/" end onClick={onClose}
            className={({ isActive }) =>
              `group relative mb-2 flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm font-medium transition-colors ${
                isActive ? 'bg-ink-900 text-white' : 'text-white/60 hover:bg-ink-900 hover:text-white'
              }`
            }>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-600" />}
                <LayoutDashboard className={`h-[18px] w-[18px] ${isActive ? 'text-brand-400' : ''}`} />
                Dashboard
              </>
            )}
          </NavLink>
          <NavGroup eyebrow="업무" items={workItems} onClose={onClose} />
          <NavGroup eyebrow="자산·관계" items={assetItems} onClose={onClose} />
          <NavGroup eyebrow="분석·설정" items={insightItems} onClose={onClose} />
          {isAdmin && (
            <>
              <div className="mt-1 flex items-center gap-1.5 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                <ShieldCheck className="h-3.5 w-3.5" /> 관리자
              </div>
              {adminItems.map((it) => (
                <NavLink key={it.to} to={it.to} onClick={onClose}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-ink-900 text-white' : 'text-white/60 hover:bg-ink-900 hover:text-white'
                    }`
                  }>
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-600" />}
                      <it.icon className={`h-[18px] w-[18px] ${isActive ? 'text-brand-400' : ''}`} />
                      {it.label}
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white/80">{displayName}</div>
            <div className="truncate text-[10px] text-white/35">{profile?.email}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
