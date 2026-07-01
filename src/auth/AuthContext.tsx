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
    // 최초 로그인 시 groupware.users에 본인 레코드가 없으면 셀프 등록 (RLS: users_insert_self)
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existing) {
      setProfile(existing as GroupwareProfile);
      return;
    }

    const { data: created, error } = await supabase
      .from('users')
      .insert({ id: userId, email, name: email.split('@')[0] })
      .select('*')
      .single();

    if (!error && created) setProfile(created as GroupwareProfile);
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
