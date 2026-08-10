import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';
import { Loader2 } from 'lucide-react';

// 로그인 확인 전에는 데이터 조회(AppDataProvider)를 시작하지 않도록 게이트 역할.
// (미인증 상태에서 groupware 스키마 조회 시 RLS에 의해 전부 차단되므로,
//  인증 확정 후에만 하위 트리를 렌더링한다.)
//
// 2026-08-10: 세션 확인 요청이 네트워크 문제로 응답을 못 받으면(hang) loading이
// 계속 true로 남아 아래 스피너에서 멈추는 '무한로딩' 증상이 있었다. AuthContext 쪽에
// catch를 추가했지만, 만에 하나를 대비해 여기서도 일정 시간 지나면 재시도 UI로
// 전환하는 이중 안전장치를 둔다.
const STUCK_TIMEOUT_MS = 10000;

function StuckLoadingFallback() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (!stuck) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-4 text-center">
      <p className="text-sm text-slate-400">연결이 지연되고 있습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.</p>
      <button onClick={() => window.location.reload()}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
        새로고침
      </button>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();

  if (loading) return <StuckLoadingFallback />;

  if (!session) return <LoginPage />;

  if (!profile) {
    // 세션은 있으나 groupware.users 프로필 로딩/생성 중
    return <StuckLoadingFallback />;
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
