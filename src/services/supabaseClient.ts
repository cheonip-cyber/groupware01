import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.');
}

// persistSession(기본값 true)이 로그인 세션을 localStorage에 저장 →
// 동일 브라우저 재방문 시 자동 로그인 유지(요청하신 "자동로그인" 요건 충족).
// autoRefreshToken(기본값 true)이 세션 만료 전 자동 갱신을 처리.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // 매직링크 콜백 URL의 토큰 자동 처리
  },
  db: {
    schema: 'groupware', // 신규 통합 스키마를 기본 스키마로 사용
  },
});
