import { useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { useToast } from '../common/toast';
import { useEscClose } from '../../hooks/useEscClose';
import { Card, CardHeader } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Building2, Plus, Trash2, X, Search } from 'lucide-react';
import type { Company } from '../../types';
import { SavingLabel } from '../common/SavingLabel';
import { useDialog } from '../common/dialog';

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
  const toast = useToast();
  const dialog = useDialog();
  const { companies, loading, addCompany, updateCompany, deleteCompany } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [search, setSearch] = useState('');

  // 목록 클릭 → 프로필 카드에서 직접 수정 (강사 관리와 동일한 방식)
  const [panel, setPanel] = useState<Company | null>(null);
  const [panelForm, setPanelForm] = useState<Record<string, string>>({});
  const [panelSaving, setPanelSaving] = useState(false);
  useEscClose(!!panel, () => setPanel(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)

  const FIELDS: [string, string, string][] = [
    ['업체명', 'companyName', 'text'],
    ['대표자명', 'ceoName', 'text'],
    ['사업자번호', 'businessNumber', 'text'],
    ['과세유형', 'taxType', 'tax'],
    ['담당자 연락처', 'managerContact', 'text'],
    ['이메일', 'email', 'text'],
    ['은행', 'bankName', 'text'],
    ['계좌번호', 'accountNumber', 'text'],
    ['사업 내용', 'businessDescription', 'area'],
  ];

  const openPanel = (c: Company) => {
    setPanel(c);
    setPanelForm({
      companyName: c.companyName ?? '', ceoName: c.ceoName ?? '',
      businessNumber: c.businessNumber ?? '', taxType: c.taxType ?? '',
      managerContact: c.managerContact ?? '', email: c.email ?? '',
      bankName: c.bankName ?? '', accountNumber: c.accountNumber ?? '',
      businessDescription: c.businessDescription ?? '',
    });
  };

  /** 값이 바뀐 항목만 저장 — 지급 이력 등 연결 데이터는 id 기준이라 영향받지 않는다 */
  const savePanel = async () => {
    if (!panel) return;
    setPanelSaving(true);
    try {
      const cur: Record<string, string> = {
        companyName: panel.companyName ?? '', ceoName: panel.ceoName ?? '',
        businessNumber: panel.businessNumber ?? '', taxType: panel.taxType ?? '',
        managerContact: panel.managerContact ?? '', email: panel.email ?? '',
        bankName: panel.bankName ?? '', accountNumber: panel.accountNumber ?? '',
        businessDescription: panel.businessDescription ?? '',
      };
      const patch: Record<string, string | undefined> = {};
      for (const k of Object.keys(cur)) {
        if ((panelForm[k] ?? '') !== cur[k]) patch[k] = panelForm[k] || undefined;
      }
      if (Object.keys(patch).length === 0) { toast.error('변경된 내용이 없습니다'); return; }
      if ('companyName' in patch && !panelForm.companyName.trim()) { toast.error('업체명은 비울 수 없습니다'); return; }
      await updateCompany(panel.id, patch as any);
      setPanel((c) => (c ? { ...c, ...(patch as any) } : c));
      toast.success('저장되었습니다');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다');
    } finally { setPanelSaving(false); }
  };

  const resetForm = () => { setForm(emptyForm); setOpen(false); };

  const handleAdd = async () => {
    if (!form.companyName) return;
    setSaving(true);
    try {
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
      toast.success('업체가 등록되었습니다 — 목록에서 업체명으로 검색해 확인하세요');
      resetForm();
    } catch (e: any) {
      toast.error(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await dialog.confirm(`'${name}' 업체를 삭제할까요?`, { tone: 'danger', confirmText: '삭제' })) return;
    await deleteCompany(id);
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
              <SavingLabel saving={saving} />
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
            <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
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
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openPanel(c)}>
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
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1.5">
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

      {panel && (
        <div className="modal-overlay fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setPanel(null)}>
          <div className="modal-slide h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">{panel.companyName}</h3>
              <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-800">
              업체 정보는 그룹웨어에서만 관리되며 외부로 동기화되지 않습니다.
              <b> 과세유형</b>은 지급요청 시 부가세 기본값 판단에 사용되니 정확히 입력해주세요.
            </p>
            <div className="space-y-3">
              {FIELDS.map(([label, key, kind]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">{label}</span>
                  {kind === 'area' ? (
                    <textarea rows={2} value={panelForm[key] ?? ''}
                      onChange={(e) => setPanelForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400" />
                  ) : kind === 'tax' ? (
                    <select value={panelForm[key] ?? ''}
                      onChange={(e) => setPanelForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400">
                      <option value="">미지정</option>
                      <option value="과세">과세</option>
                      <option value="면세">면세</option>
                    </select>
                  ) : (
                    <input value={panelForm[key] ?? ''}
                      onChange={(e) => setPanelForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400" />
                  )}
                </label>
              ))}
              {!panelForm.bankName && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">계좌가 등록되지 않았습니다 — 위 은행·계좌번호를 입력해주세요.</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setPanel(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">닫기</button>
                <button onClick={savePanel} disabled={panelSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {panelSaving ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
