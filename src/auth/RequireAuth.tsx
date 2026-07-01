import { useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';
import { Loader2 } from 'lucide-react';

// 로그인 확인 전에는 데이터 조회(AppDataProvider)를 시작하지 않도록 게이트 역할.
// (미인증 상태에서 groupware 스키마 조회 시 RLS에 의해 전부 차단되므로,
//  인증 확정 후에만 하위 트리를 렌더링한다.)
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  if (!profile) {
    // 세션은 있으나 groupware.users 프로필 로딩/생성 중
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center">
        <p className="text-sm text-slate-400">계정이 비활성화되어 있습니다. 관리자에게 문의해주세요.</p>
      </div>
    );
  }

  return <>{children}</>;
}
