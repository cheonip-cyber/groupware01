import { useState } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { Building2, Plus, Trash2 } from 'lucide-react';

export function CompaniesPage() {
  const { companies, loading, addCompany, deleteCompany } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ companyName: '', ceoName: '', businessNumber: '', managerContact: '', email: '' });

  const resetForm = () => { setForm({ companyName: '', ceoName: '', businessNumber: '', managerContact: '', email: '' }); setOpen(false); };

  const handleAdd = async () => {
    if (!form.companyName) return;
    setSaving(true);
    await addCompany({
      companyName: form.companyName,
      ceoName: form.ceoName || undefined,
      businessNumber: form.businessNumber || undefined,
      managerContact: form.managerContact || undefined,
      email: form.email || undefined,
    });
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 업체를 삭제할까요?`)) return;
    await deleteCompany(id);
  };

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <Card>
      <CardHeader
        title={`업체 목록 (${companies.length}개)`}
        icon={<Building2 className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> 업체 추가
          </button>
        }
      />

      {open && (
        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <input placeholder="업체명*" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} className={inputCls} />
            <input placeholder="대표자명" value={form.ceoName} onChange={(e) => setForm((s) => ({ ...s, ceoName: e.target.value }))} className={inputCls} />
            <input placeholder="사업자번호" value={form.businessNumber} onChange={(e) => setForm((s) => ({ ...s, businessNumber: e.target.value }))} className={inputCls} />
            <input placeholder="담당자 연락처" value={form.managerContact} onChange={(e) => setForm((s) => ({ ...s, managerContact: e.target.value }))} className={inputCls} />
            <input placeholder="이메일" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} className={inputCls} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} disabled={saving || !form.companyName}
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
            <th className="px-5 py-2.5 font-medium">업체명</th>
            <th className="px-3 py-2.5 font-medium">대표자</th>
            <th className="px-3 py-2.5 font-medium">사업자번호</th>
            <th className="px-3 py-2.5 font-medium">담당자 연락처</th>
            <th className="px-3 py-2.5 font-medium">이메일</th>
            <th className="px-3 py-2.5 font-medium">삭제</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{c.companyName}</td>
                <td className="px-3 py-3 text-slate-600">{c.ceoName || '-'}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{c.businessNumber || '-'}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{c.managerContact || '-'}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{c.email || '-'}</td>
                <td className="px-3 py-3">
                  <button onClick={() => handleDelete(c.id, c.companyName)} className="text-slate-400 hover:text-red-500" title="삭제(관리자 권한 필요)">
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
