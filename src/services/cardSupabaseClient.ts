import { createClient } from '@supabase/supabase-js';

// CARD 프로젝트(카드사용/판관비 관리 전용) — 그룹웨어 메인 Supabase와 별개 프로젝트.
// 데이터를 복사하지 않고 실시간으로 직접 조회한다(관리자화면 전용).
const url = import.meta.env.VITE_CARD_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_CARD_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('CARD Supabase 환경변수(VITE_CARD_SUPABASE_URL / VITE_CARD_SUPABASE_ANON_KEY)가 설정되지 않았습니다.');
}

export const cardSupabase = createClient(url, anonKey, {
  auth: { persistSession: false }, // CARD 프로젝트는 별도 로그인 없이 anon 키로만 접근
});
