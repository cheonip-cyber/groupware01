import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useAppData } from '../../store/appData';
import { GlobalSearch } from '../common/GlobalSearch';
import { dataSource } from '../../services/dataSource';
import { projectYear } from '../../utils/filters';
import type { SyncStatus } from '../../types';

const today = () => {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
};

// 노션 동기화 상태 인디케이터: 60초 주기 폴링. 점 문법(설계안 §4.4)으로 정상/지연/오류를 색+형태로 이중 표시
function SyncIndicator() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => dataSource.getSyncStatus().then((s) => { if (alive) setStatus(s); }).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!status) return null;
  const mins = status.lastSyncedAt ? Math.max(0, Math.round((Date.now() - new Date(status.lastSyncedAt).getTime()) / 60000)) : null;
  const isError = status.status === 'error';
  const stale = mins !== null && mins > 30; // 30분 이상 무동기화 = 지연

  const tone = isError
    ? { wrap: 'border-red-200 bg-red-50 text-red-700', dotClass: 'dot dot-alert', dotColor: '#DC2626' }
    : stale
    ? { wrap: 'border-amber-200 bg-amber-50 text-amber-700', dotClass: 'dot dot-ring', dotColor: '#D97706' }
    : { wrap: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100', dotClass: 'dot dot-pulse', dotColor: '#059669' };

  return (
    <button onClick={() => navigate('/settings')}
      title={status.message ?? '노션 동기화 상태 — 클릭 시 설정으로 이동'}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:flex ${tone.wrap}`}>
      <span className={tone.dotClass} style={{ '--dot-color': tone.dotColor } as CSSProperties} />
      {isError ? '동기화 오류' : stale ? `동기화 지연 · ${mins}분` : mins === null ? '동기화' : mins === 0 ? '방금 동기화' : `동기화 ${mins}분 전`}
    </button>
  );
}

export function Header({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { projects, globalYear, setGlobalYear } = useAppData();
  const displayName = profile?.name || profile?.email?.split('@')[0] || '사용자';
  const initials = displayName.slice(0, 2).toUpperCase();

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(projectYear).filter((y): y is string => !!y))].sort().reverse();
    return ys.length > 0 ? ys : [String(new Date().getFullYear())];
  }, [projects]);

  return (
    <header className="sticky top-0 z-30 border-b border-[--color-ink-950]/[0.08] bg-white/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-7">
        <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold tracking-tight text-[--color-text-strong] lg:text-xl">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {/* 전역 기간 컨텍스트: 대시보드·리포트·목록이 공유하는 조회 연도 */}
          <select value={globalYear} onChange={(e) => setGlobalYear(e.target.value)}
            title="전역 조회 연도 — 대시보드·리포트·프로젝트 목록에 함께 적용"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-600">
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            <option value="전체">전체 연도</option>
          </select>
          <GlobalSearch />
          <SyncIndicator />
        </div>
        <span className="hidden text-sm text-[--color-text-sub] sm:block">{today()}</span>
        <div className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[--color-ink-950] text-xs font-bold text-white">{initials}</div>
          <div className="hidden sm:block">
            <span className="text-sm font-medium text-slate-700">{displayName}</span>
            {isAdmin && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">관리자</span>}
          </div>
        </div>
        <button onClick={() => signOut()} title="로그아웃" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
