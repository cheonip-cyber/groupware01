import { useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Building2, Plus, Trash2, Pencil, Check, X, Search } from 'lucide-react';
import type { Company } from '../../types';

type CompanyForm = {
  companyName: string;
  businessDescription: string;
  ceoName: string;
  managerContact: string;
  bankName: string;
  accountNumber: string;
  businessNumber: string;
  taxType: '과세' | '면세';
  email: string;
};

const emptyForm: CompanyForm = {
  companyName: '', businessDescription: '', ceoName: '', managerContact: '',
  bankName: '', accountNumber: '', businessNumber: '', taxType: '과세', email: '',
};

const taxTypeBadge: Record<string, string> = {
  '과세': 'bg-blue-50 text-blue-600',
  '면세': 'bg-emerald-50 text-emerald-600',
};

export function CompaniesPage() {
  const { companies, loading, addCompany, updateCompany, deleteCompany } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CompanyForm>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const resetForm = () => { setForm(emptyForm); setOpen(false); };

  const handleAdd = async () => {
    if (!form.companyName) return;
    setSaving(true);
    await addCompany({
      companyName: form.companyName,
      businessDescription: form.businessDescription || undefined,
      ceoName: form.ceoName || undefined,
      managerContact: form.managerContact || undefined,
      bankName: form.bankName || undefined,
      accountNumber: form.accountNumber || undefined,
      businessNumber: form.businessNumber || undefined,
      taxType: form.taxType,
      email: form.email || undefined,
    });
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 업체를 삭제할까요?`)) return;
    await deleteCompany(id);
  };

  const startEdit = (c: Company) => {
    setEditingId(c.id);
    setEditForm({
      companyName: c.companyName,
      businessDescription: c.businessDescription ?? '',
      ceoName: c.ceoName ?? '',
      managerContact: c.managerContact ?? '',
      bankName: c.bankName ?? '',
      accountNumber: c.accountNumber ?? '',
      businessNumber: c.businessNumber ?? '',
      taxType: c.taxType ?? '과세',
      email: c.email ?? '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };

  const saveEdit = async (id: string) => {
    setEditSaving(true);
    await updateCompany(id, {
      companyName: editForm.companyName,
      businessDescription: editForm.businessDescription || undefined,
      ceoName: editForm.ceoName || undefined,
      managerContact: editForm.managerContact || undefined,
      bankName: editForm.bankName || undefined,
      accountNumber: editForm.accountNumber || undefined,
      businessNumber: editForm.businessNumber || undefined,
      taxType: editForm.taxType,
      email: editForm.email || undefined,
    });
    setEditSaving(false);
    cancelEdit();
  };

  // 검색(업체명/대표자명/사업내용) 필터 + 가나다순 정렬
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies
      .filter((c) =>
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        (c.ceoName ?? '').toLowerCase().includes(q) ||
        (c.businessDescription ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko-KR'));
  }, [companies, search]);

  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';
  const editInputCls = 'w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400';

  return (
    <Card>
      <CardHeader
        title={`업체 DB 관리 (${companies.length}개)`}
        icon={<Building2 className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> 업체 등록
          </button>
        }
      />

      <div className="border-b border-slate-100 px-5 py-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="업체명, 대표자명, 사업내용 검색..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {open && (
        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input placeholder="업체명*" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} className={inputCls} />
            <input placeholder="사업자번호" value={form.businessNumber} onChange={(e) => setForm((s) => ({ ...s, businessNumber: e.target.value }))} className={inputCls} />
            <input placeholder="대표자명" value={form.ceoName} onChange={(e) => setForm((s) => ({ ...s, ceoName: e.target.value }))} className={inputCls} />
            <select value={form.taxType} onChange={(e) => setForm((s) => ({ ...s, taxType: e.target.value as CompanyForm['taxType'] }))} className={inputCls}>
              <option value="과세">과세</option>
              <option value="면세">면세</option>
            </select>
            <input placeholder="사업내용" value={form.businessDescription} onChange={(e) => setForm((s) => ({ ...s, businessDescription: e.target.value }))} className={`${inputCls} sm:col-span-2`} />
            <input placeholder="담당자 연락처" value={form.managerContact} onChange={(e) => setForm((s) => ({ ...s, managerContact: e.target.value }))} className={inputCls} />
            <input placeholder="이메일" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} className={inputCls} />
            <input placeholder="은행" value={form.bankName} onChange={(e) => setForm((s) => ({ ...s, bankName: e.target.value }))} className={inputCls} />
            <input placeholder="계좌번호" value={form.accountNumber} onChange={(e) => setForm((s) => ({ ...s, accountNumber: e.target.value }))} className={inputCls} />
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

      {filtered.length === 0 ? (
        <EmptyState title={search ? '검색 결과가 없습니다' : '등록된 업체가 없습니다'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2.5 text-center font-medium">No.</th>
              <th className="px-3 py-2.5 font-medium">업체명</th>
              <th className="px-3 py-2.5 font-medium">사업내용</th>
              <th className="px-3 py-2.5 font-medium">대표자/담당자</th>
              <th className="px-3 py-2.5 font-medium">계좌정보</th>
              <th className="px-3 py-2.5 font-medium">과세유형</th>
              <th className="px-3 py-2.5 font-medium">관리</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((c, idx) => {
                const isEditing = editingId === c.id;
                if (isEditing) {
                  return (
                    <tr key={c.id} className="bg-blue-50/40">
                      <td className="px-4 py-2 text-center font-mono text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2"><input className={editInputCls} value={editForm.companyName} onChange={(e) => setEditForm((s) => ({ ...s, companyName: e.target.value }))} /></td>
                      <td className="px-3 py-2"><input className={editInputCls} value={editForm.businessDescription} onChange={(e) => setEditForm((s) => ({ ...s, businessDescription: e.target.value }))} /></td>
                      <td className="px-3 py-2 space-y-1">
                        <input placeholder="대표자명" className={editInputCls} value={editForm.ceoName} onChange={(e) => setEditForm((s) => ({ ...s, ceoName: e.target.value }))} />
                        <input placeholder="담당자 연락처" className={editInputCls} value={editForm.managerContact} onChange={(e) => setEditForm((s) => ({ ...s, managerContact: e.target.value }))} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <input placeholder="은행" className={editInputCls} value={editForm.bankName} onChange={(e) => setEditForm((s) => ({ ...s, bankName: e.target.value }))} />
                          <input placeholder="계좌번호" className={editInputCls} value={editForm.accountNumber} onChange={(e) => setEditForm((s) => ({ ...s, accountNumber: e.target.value }))} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select className={editInputCls} value={editForm.taxType} onChange={(e) => setEditForm((s) => ({ ...s, taxType: e.target.value as CompanyForm['taxType'] }))}>
                          <option value="과세">과세</option>
                          <option value="면세">면세</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEdit(c.id)} disabled={editSaving} className="text-green-600 hover:text-green-700" title="저장">
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
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{c.companyName}</td>
                    <td className="max-w-xs whitespace-pre-line px-3 py-3 text-xs text-slate-500">{c.businessDescription || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-700">{c.ceoName || '-'}</div>
                      {c.managerContact && <div className="mt-0.5 text-xs text-slate-400">{c.managerContact}</div>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {c.bankName && c.accountNumber ? `${c.bankName} | ${c.accountNumber}` : '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${taxTypeBadge[c.taxType ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>
                        {c.taxType || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => startEdit(c)} className="text-slate-400 hover:text-blue-500" title="편집">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(c.id, c.companyName)} className="text-slate-400 hover:text-red-500" title="삭제(관리자 권한 필요)">
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
      )}
    </Card>
  );
}
