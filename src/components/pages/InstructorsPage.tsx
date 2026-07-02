import { useState } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Users, Plus, Trash2 } from 'lucide-react';

export function InstructorsPage() {
  const { instructors, loading, addInstructor, deleteInstructor } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', expertise: '', defaultFee: '' });

  const resetForm = () => { setForm({ name: '', phone: '', email: '', expertise: '', defaultFee: '' }); setOpen(false); };

  const handleAdd = async () => {
    if (!form.name) return;
    setSaving(true);
    await addInstructor({
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      expertise: form.expertise ? form.expertise.split(',').map((s) => s.trim()).filter(Boolean) : [],
      defaultFee: form.defaultFee ? Number(form.defaultFee) : 0,
    });
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 강사를 삭제할까요?`)) return;
    await deleteInstructor(id);
  };

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <Card>
      <CardHeader
        title={`강사 목록 (${instructors.length}명)`}
        icon={<Users className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> 강사 추가
          </button>
        }
      />

      {open && (
        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <input placeholder="이름*" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className={inputCls} />
            <input placeholder="연락처" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} className={inputCls} />
            <input placeholder="이메일" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} className={inputCls} />
            <input placeholder="전문분야(쉼표구분)" value={form.expertise} onChange={(e) => setForm((s) => ({ ...s, expertise: e.target.value }))} className={inputCls} />
            <input placeholder="기본 강사료" type="number" value={form.defaultFee} onChange={(e) => setForm((s) => ({ ...s, defaultFee: e.target.value }))} className={inputCls} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} disabled={saving || !form.name}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? '저장 중…' : '저장'}
            </button>
            <button onClick={resetForm} className="rounded-lg px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-100">취소</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">이름</th>
            <th className="px-3 py-2.5 font-medium">전문분야</th>
            <th className="px-3 py-2.5 font-medium">연락처</th>
            <th className="px-3 py-2.5 text-right font-medium">기본 강사료</th>
            <th className="px-3 py-2.5 font-medium">삭제</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {instructors.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{i.name}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {i.expertise.map((e) => (
                      <span key={e} className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{e}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-500">{i.phone || '-'}</td>
                <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={i.defaultFee} /></td>
                <td className="px-3 py-3">
                  <button onClick={() => handleDelete(i.id, i.name)} className="text-slate-400 hover:text-red-500" title="삭제(관리자 권한 필요)">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
