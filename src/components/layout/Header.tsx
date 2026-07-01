import { Menu, Search, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const today = () => {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
};

export function Header({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { profile, isAdmin, signOut } = useAuth();
  const displayName = profile?.name || profile?.email?.split('@')[0] || '사용자';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-7">
        <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
        <h1 className="text-base font-bold text-slate-800 lg:text-lg">{title}</h1>
        <div className="ml-auto hidden items-center md:flex">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input placeholder="프로젝트·고객사 검색" className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
          </div>
        </div>
        <span className="hidden text-sm text-slate-500 sm:block">{today()}</span>
        <button className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <div className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">{initials}</div>
          <div className="hidden sm:block">
            <span className="text-sm font-medium text-slate-700">{displayName}</span>
            {isAdmin && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">관리자</span>}
          </div>
        </div>
        <button onClick={() => signOut()} title="로그아웃" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
