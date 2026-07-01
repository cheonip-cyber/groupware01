import { useState } from 'react';
import { useAuth } from './AuthContext';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { sendMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { error: err } = await sendMagicLink(email);
    setSending(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold tracking-tight text-white">
            SAM<span className="text-blue-400">.</span>SOTTA
          </div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">Groupware</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-white">인증 링크를 보냈습니다</p>
              <p className="mt-1.5 text-xs text-slate-400">
                <span className="text-slate-300">{email}</span> 메일함을 확인하여
                <br />로그인 링크를 클릭해주세요.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-5 text-xs text-slate-500 hover:text-slate-300"
              >
                다른 이메일로 다시 시도
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">회사 이메일</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@samsotta.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {sending ? '전송 중…' : '인증 링크 받기'}
              </button>
              <p className="mt-4 text-center text-[11px] text-slate-500">
                비밀번호 없이 이메일 링크로 로그인합니다.
                <br />최초 인증 후에는 이 브라우저에서 자동으로 로그인 상태가 유지됩니다.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
