import { useState } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { Users, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import type { Instructor } from '../../types';

type SensitiveForm = {
  name: string;
  phone: string;
  residentNumber: string;
  address: string;
  bankName: string;
  accountNumber: string;
};

const emptyForm: SensitiveForm = { name: '', phone: '', residentNumber: '', address: '', bankName: '', accountNumber: '' };

export function InstructorsPage() {
  const { instructors, loading, addInstructor, updateInstructor, deleteInstructor } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SensitiveForm>(emptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SensitiveForm>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const resetForm = () => { setForm(emptyForm); setOpen(false); };

  const handleAdd = async () => {
    if (!form.name) return;
    setSaving(true);
    await addInstructor({
      name: form.name,
      phone: form.phone || undefined,
      expertise: [],
      defaultFee: 0,
      residentNumber: form.residentNumber || undefined,
      address: form.address || undefined,
      bankName: form.bankName || undefined,
      accountNumber: form.accountNumber || undefined,
    });
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 강사를 삭제할까요?`)) return;
    await deleteInstructor(id);
  };

  const startEdit = (i: Instructor) => {
    setEditingId(i.id);
    setEditForm({
      name: i.name,
      phone: i.phone ?? '',
      residentNumber: i.residentNumber ?? '',
      address: i.address ?? '',
      bankName: i.bankName ?? '',
      accountNumber: i.accountNumber ?? '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };

  const saveEdit = async (id: string) => {
    setEditSaving(true);
    await updateInstructor(id, {
      name: editForm.name,
      phone: editForm.phone || undefined,
      residentNumber: editForm.residentNumber || undefined,
      address: editForm.address || undefined,
      bankName: editForm.bankName || undefined,
      accountNumber: editForm.accountNumber || undefined,
    });
    setEditSaving(false);
    cancelEdit();
  };

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';
  const editInputCls = 'w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono outline-none focus:border-blue-400';

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <input placeholder="이름*" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className={inputCls} />
            <input placeholder="연락처" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} className={inputCls} />
            <input placeholder="주민등록번호" value={form.residentNumber} onChange={(e) => setForm((s) => ({ ...s, residentNumber: e.target.value }))} className={inputCls} />
            <input placeholder="주소" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} className={inputCls} />
            <input placeholder="은행" value={form.bankName} onChange={(e) => setForm((s) => ({ ...s, bankName: e.target.value }))} className={inputCls} />
            <input placeholder="계좌번호" value={form.accountNumber} onChange={(e) => setForm((s) => ({ ...s, accountNumber: e.target.value }))} className={inputCls} />
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
            <th className="px-3 py-2.5 font-medium">전문분야 / 등급</th>
            <th className="px-3 py-2.5 font-medium">연락처</th>
            <th className="px-3 py-2.5 font-medium">주민등록번호</th>
            <th className="px-3 py-2.5 font-medium">주소</th>
            <th className="px-3 py-2.5 font-medium">계좌정보</th>
            <th className="px-3 py-2.5 font-medium">관리</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {instructors.map((i) => {
              const isEditing = editingId === i.id;
              if (isEditing) {
                return (
                  <tr key={i.id} className="bg-blue-50/40">
                    <td className="px-5 py-2"><input className={editInputCls + ' font-sans'} value={editForm.name} onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))} /></td>
                    <td className="px-3 py-2 text-xs text-slate-400">Notion 관리</td>
                    <td className="px-3 py-2"><input className={editInputCls + ' font-sans'} value={editForm.phone} onChange={(e) => setEditForm((s) => ({ ...s, phone: e.target.value }))} /></td>
                    <td className="px-3 py-2"><input className={editInputCls} value={editForm.residentNumber} onChange={(e) => setEditForm((s) => ({ ...s, residentNumber: e.target.value }))} /></td>
                    <td className="px-3 py-2"><input className={editInputCls + ' font-sans'} value={editForm.address} onChange={(e) => setEditForm((s) => ({ ...s, address: e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <input placeholder="은행" className={editInputCls + ' font-sans'} value={editForm.bankName} onChange={(e) => setEditForm((s) => ({ ...s, bankName: e.target.value }))} />
                        <input placeholder="계좌번호" className={editInputCls} value={editForm.accountNumber} onChange={(e) => setEditForm((s) => ({ ...s, accountNumber: e.target.value }))} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => saveEdit(i.id)} disabled={editSaving} className="text-green-600 hover:text-green-700" title="저장">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600" title="취소">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {i.name}{i.honorific ? <span className="ml-1 text-xs font-normal text-slate-400">{i.honorific}</span> : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600" title={[i.career, i.education].filter(Boolean).join(' · ') || undefined}>
                    {i.specialty || '-'}{i.level ? <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{i.level}</span> : null}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{i.phone || '-'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-500">{i.residentNumber || '-'}</td>
                  <td className="px-3 py-3 text-slate-500">{i.address || '-'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-500">
                    {i.bankName && i.accountNumber ? `${i.bankName} ${i.accountNumber}` : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => startEdit(i)} className="text-slate-400 hover:text-blue-500" title="편집">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(i.id, i.name)} className="text-slate-400 hover:text-red-500" title="삭제(관리자 권한 필요)">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
