import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

export interface GroupwareProfile {
  id: string;
  email: string;
  name: string | null;
  role: 'staff' | 'admin';
  is_active: boolean;
}

interface AuthValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: GroupwareProfile | null;
  isAdmin: boolean;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

// 회사 이메일 도메인 화이트리스트 (매직링크 로그인 허용 범위)
const ALLOWED_DOMAIN = '@samsotta.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<GroupwareProfile | null>(null);

  const loadProfile = useCallback(async (userId: string, email: string) => {
    // groupware.users 행은 이제 DB 트리거(on_auth_user_created)가 auth.users 생성 시
    // 자동으로 만들어준다(SECURITY DEFINER, RLS 우회). 클라이언트는 조회만 하면 되고,
    // 트리거 반영 타이밍 대비 짧게 재시도한다.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // eslint-disable-next-line no-console
        console.error('프로필 조회 실패:', error.message);
        return;
      }
      if (existing) {
        setProfile(existing as GroupwareProfile);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    // eslint-disable-next-line no-console
    console.error(`groupware.users 프로필을 찾을 수 없습니다 (email: ${email}). 트리거 동작을 확인해주세요.`);
  }, []);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) {
          loadProfile(data.session.user.id, data.session.user.email ?? '').finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        // 세션 확인 요청이 네트워크 문제로 실패해도(예: 일시적 단절) loading이 영원히 true로
        // 남지 않도록 한다. 이전에는 .catch()가 없어 이 경우 로그인 화면 진입 전 단계인
        // 로딩 스피너에서 멈춰버리는(무한로딩) 결함이 있었다(2026-08-10 발견/수정).
        // eslint-disable-next-line no-console
        console.error('세션 확인 실패:', err instanceof Error ? err.message : err);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        loadProfile(newSession.user.id, newSession.user.email ?? '');
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const sendMagicLink = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(ALLOWED_DOMAIN)) {
      return { error: `회사 이메일(${ALLOWED_DOMAIN})로만 로그인할 수 있습니다.` };
    }
    // 2026-09-28 수정: 기존엔 shouldCreateUser:false 하나로 미등록 주소를 막았는데, 이러면 '등록은 됐지만
    // 아직 계정이 없는 신규 입사자'의 첫 로그인까지 막혀버렸다(8/1 보안 강화 이후 첫 신규 입사자에서 발견).
    // 그래서 ① 등록(allowed_signups) 또는 기존 사용자인지 DB 함수로 먼저 확인해 미등록 주소는 메일 발송 없이
    // 차단하고, ② 등록된 주소만 shouldCreateUser:true 로 첫 로그인 시 계정 생성을 허용한다.
    // 그룹웨어 사용자 행 생성/권한 부여는 그대로 DB 트리거 handle_new_auth_user 가 사전 등록 명단 기준으로 처리한다.
    const { data: allowed, error: checkError } = await supabase.rpc('can_request_login', { p_email: trimmed });
    if (checkError) return { error: checkError.message };
    if (!allowed) return { error: '등록되지 않은 계정입니다. 관리자에게 계정 등록을 요청해주세요.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    if (error) {
      // 미등록 주소는 Supabase가 'Signups not allowed for otp' 계열 메시지를 반환한다 — 사유를 알기 쉽게 바꿔준다
      const msg = /signup|not allowed|not found/i.test(error.message)
        ? '등록되지 않은 계정입니다. 관리자에게 계정 등록을 요청해주세요.'
        : error.message;
      return { error: msg };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        isAdmin: profile?.role === 'admin',
        sendMagicLink,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = (): AuthValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
};
