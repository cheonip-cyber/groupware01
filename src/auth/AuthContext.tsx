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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id, data.session.user.email ?? '').finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
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
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error ? error.message : null };
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
