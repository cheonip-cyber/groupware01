import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Trash2, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../common/toast';
import { useDialog } from '../common/dialog';
import { Card, CardHeader } from '../common/Card';

// 신규 입사자 계정 등록 (2026-07-31)
// 로그인 보안 강화로 미등록 주소는 매직링크가 발송되지 않으므로, 관리자가 먼저 주소를 등록해야 한다.
// groupware.users.id는 auth.users(id)를 참조해 로그인 전에는 사용자 행을 만들 수 없기 때문에,
// 여기서는 '가입 허용 목록(allowed_signups)'에 등록하고 첫 로그인 시 트리거가 실제 계정을 만든다.

const DOMAIN = '@samsotta.com';

interface Allowed {
  email: string;
  name: string | null;
  role: 'staff' | 'admin';
  created_at: string;
  used_at: string | null;
}

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: 'staff' | 'admin';
  is_active: boolean;
}

const fmt = (v?: string | null) => (v ? v.slice(0, 10).replace(/-/g, '.') : '-');

export function AdminUsersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const dialog = useDialog();

  const [allowed, setAllowed] = useState<Allowed[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        supabase.from('allowed_signups').select('email, name, role, created_at, used_at').order('created_at', { ascending: false }),
        supabase.from('users').select('id, email, name, role, is_active').order('email'),
      ]);
      if (a.error) throw a.error;
      if (u.error) throw u.error;
      setAllowed((a.data ?? []) as Allowed[]);
      setUsers((u.data ?? []) as AppUser[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '목록을 불러오지 못했습니다');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr.endsWith(DOMAIN)) { toast.error(`회사 이메일(${DOMAIN})만 등록할 수 있습니다`); return; }
    if (users.some((u) => u.email.toLowerCase() === addr)) { toast.error('이미 사용 중인 계정입니다'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('allowed_signups')
        .upsert({ email: addr, name: name.trim() || null, role, invited_by: profile?.id ?? null }, { onConflict: 'email' });
      if (error) throw error;
      setEmail(''); setName(''); setRole('staff');
      await load();
      toast.success('등록했습니다 — 본인이 로그인 화면에서 이메일을 입력하면 접속할 수 있습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록하지 못했습니다');
    } finally { setSaving(false); }
  }

  async function removeAllowed(row: Allowed) {
    const extra = row.used_at ? '\n\n이미 가입을 마친 주소입니다. 목록에서만 지워지고 기존 계정은 그대로 유지됩니다.' : '';
    if (!await dialog.confirm(`'${row.email}' 등록을 취소할까요?${extra}`, { tone: 'danger', confirmText: '삭제' })) return;
    try {
      const { data, error } = await supabase.from('allowed_signups').delete().eq('email', row.email).select('email');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('삭제가 반영되지 않았습니다(0건). 권한을 확인해주세요.');
      await load();
      toast.success('삭제했습니다');
    } catch (e) { toast.error(e instanceof Error ? e.message : '삭제하지 못했습니다'); }
  }

  /** 계정 사용 중지/재개 — 퇴사자는 삭제 대신 비활성으로 둬 기록을 보존한다 */
  async function toggleActive(u: AppUser) {
    if (u.id === profile?.id) { toast.error('본인 계정은 변경할 수 없습니다'); return; }
    const next = !u.is_active;
    if (!await dialog.confirm(
      next ? `'${u.email}' 계정을 다시 사용하도록 할까요?`
           : `'${u.email}' 계정을 사용 중지할까요?\n\n로그인과 데이터 접근이 즉시 차단됩니다. (기록은 그대로 보존)`,
      next ? {} : { tone: 'danger', confirmText: '사용 중지' })) return;
    try {
      const { data, error } = await supabase.from('users').update({ is_active: next }).eq('id', u.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('변경이 반영되지 않았습니다(0건). 권한을 확인해주세요.');
      await load();
      toast.success(next ? '사용을 재개했습니다' : '사용을 중지했습니다');
    } catch (e) { toast.error(e instanceof Error ? e.message : '변경하지 못했습니다'); }
  }

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';
  const pending = allowed.filter((a) => !a.used_at);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="신규 입사자 계정 등록" icon={<UserPlus className="h-4 w-4 text-slate-400" />} />
        <div className="p-5">
          <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2.5 text-[12px] leading-relaxed text-blue-800">
            보안을 위해 <b>등록되지 않은 이메일로는 로그인 메일이 발송되지 않습니다.</b> 여기에 먼저 주소를 등록하면,
            본인이 로그인 화면에서 그 주소를 입력해 접속할 수 있습니다. 회사 이메일({DOMAIN})만 등록 가능합니다.
          </p>

          <form onSubmit={submit} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_auto]">
            <input value={email} onChange={(e) => setEmail(e.target.value)} required
              placeholder={`이메일 (예: hong${DOMAIN})`} className={inputCls} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(선택)" className={inputCls} />
            <select value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'admin')} className={inputCls}>
              <option value="staff">일반</option>
              <option value="admin">관리자</option>
            </select>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? '등록 중…' : '등록'}
            </button>
          </form>

          {pending.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-slate-500">첫 로그인 대기 ({pending.length}명)</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {pending.map((a) => (
                  <li key={a.email} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span>
                      <b className="text-slate-800">{a.name || a.email.split('@')[0]}</b>
                      <span className="ml-2 text-slate-500">{a.email}</span>
                      {a.role === 'admin' && <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">관리자</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{fmt(a.created_at)} 등록</span>
                      <button onClick={() => removeAllowed(a)} className="text-slate-300 hover:text-red-500" title="등록 취소">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`사용자 계정 (${users.length}명)`} icon={<Users className="h-4 w-4 text-slate-400" />} />
        {loading ? <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">이름</th>
                <th className="px-3 py-2.5 font-medium">이메일</th>
                <th className="px-3 py-2.5 font-medium">권한</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">관리</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {u.name || '-'}
                      {u.id === profile?.id && <span className="ml-1.5 text-[10px] text-slate-400">(본인)</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-500">{u.email}</td>
                    <td className="px-3 py-3">
                      {u.role === 'admin'
                        ? <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700"><ShieldCheck className="h-3 w-3" />관리자</span>
                        : <span className="text-xs text-slate-500">일반</span>}
                    </td>
                    <td className="px-3 py-3">
                      {u.is_active
                        ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">사용중</span>
                        : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">중지</span>}
                    </td>
                    <td className="px-3 py-3">
                      {u.id !== profile?.id && (
                        <button onClick={() => toggleActive(u)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${u.is_active
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                          {u.is_active ? '사용 중지' : '사용 재개'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
