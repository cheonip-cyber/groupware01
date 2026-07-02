import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ShieldAlert } from 'lucide-react';

// 관리자 전용 화면 접근 가드. URL을 직접 입력해도 staff는 접근 불가.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, isAdmin } = useAuth();

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm">관리자만 접근할 수 있는 화면입니다.</p>
      </div>
    );
  }

  return <>{children}</>;
}
