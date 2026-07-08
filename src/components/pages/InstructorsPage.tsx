import { useState } from 'react';
import { useEscClose } from '../../hooks/useEscClose';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { Users, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import type { Instructor } from '../../types';
import { maskResidentNumber } from '../../utils/withholding';
import { useToast } from '../common/toast';
import { SavingLabel } from '../common/SavingLabel';

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
  const { instructors, paymentRequests, loading, addInstructor, updateInstructor, deleteInstructor } = useAppData();
  const toast = useToast();
  const [panel, setPanel] = useState<Instructor | null>(null);       // 상세 슬라이드 패널
  useEscClose(!!panel, () => setPanel(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)
  const [noAccountOnly, setNoAccountOnly] = useState(false);          // 계좌 미등록 필터 (76명 정비용)
  const [query, setQuery] = useState('');                              // 이름/분야/연락처 검색
  const [sortKey, setSortKey] = useState<'name' | 'specialty'>('name');
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
    try {
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
      toast.success(`'${form.name}' 강사가 등록되었습니다 — 목록에서 이름으로 검색해 확인하세요`);
      resetForm();
    } catch (e: any) { toast.error(`저장 실패: ${e?.message ?? e}`); }
    finally { setSaving(false); }
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
          <span className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·분야·연락처 검색" autoComplete="off"
              className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400 focus:bg-white" />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={noAccountOnly} onChange={(e) => setNoAccountOnly(e.target.checked)} className="h-3.5 w-3.5" />
              계좌 미등록만 ({instructors.filter((i) => !i.bankName || !i.accountNumber).length}명)
            </label>
            <button onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> 강사 추가
            </button>
          </span>
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
              <SavingLabel saving={saving} />
            </button>
            <button onClick={resetForm} className="rounded-lg px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-100">취소</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="w-10 px-4 py-2.5 font-medium">No.</th>
            <th className="cursor-pointer px-5 py-2.5 font-medium hover:text-slate-600" onClick={() => setSortKey('name')} style={{ minWidth: '7rem' }}>이름 {sortKey === 'name' ? '↓' : ''}</th>
            <th className="cursor-pointer px-3 py-2.5 font-medium hover:text-slate-600" onClick={() => setSortKey('specialty')}>전문분야 / 등급 {sortKey === 'specialty' ? '↓' : ''}</th>
            <th className="px-3 py-2.5 font-medium">연락처</th>
            <th className="px-3 py-2.5 font-medium">주민등록번호</th>
            <th className="px-3 py-2.5 font-medium">계좌정보</th>
            <th className="px-3 py-2.5 font-medium">관리</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {query.trim() && instructors.filter((i) => `${i.name} ${i.specialty ?? ''} ${i.phone ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">'{query}' 검색 결과가 없습니다 — 방금 등록했다면 새로고침 후 다시 검색해 보세요</td></tr>
            )}
            {instructors
              .filter((i) => !noAccountOnly || !i.bankName || !i.accountNumber)
              .filter((i) => {
                const q = query.trim().toLowerCase();
                return !q || `${i.name} ${i.specialty ?? ''} ${i.phone ?? ''} ${i.level ?? ''}`.toLowerCase().includes(q);
              })
              .sort((a, b) => (sortKey === 'name'
                ? a.name.localeCompare(b.name, 'ko')
                : (a.specialty ?? 'ㅎㅎㅎ').localeCompare(b.specialty ?? 'ㅎㅎㅎ', 'ko')))
              .map((i, __idx) => {
              const isEditing = editingId === i.id;
              if (isEditing) {
                return (
                  <tr key={i.id} className="bg-blue-50/40">
                    <td className="px-4 py-2 text-xs text-slate-400">{__idx + 1}</td>
                    <td className="px-5 py-2"><input className={editInputCls + ' font-sans'} value={editForm.name} onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))} /></td>
                    <td className="px-3 py-2 text-xs text-slate-400">Notion 관리</td>
                    <td className="px-3 py-2"><input className={editInputCls + ' font-sans'} value={editForm.phone} onChange={(e) => setEditForm((s) => ({ ...s, phone: e.target.value }))} /></td>
                    <td className="px-3 py-2"><input className={editInputCls} value={editForm.residentNumber} onChange={(e) => setEditForm((s) => ({ ...s, residentNumber: e.target.value }))} /></td>
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
                <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setPanel(i)}>
                  <td className="px-4 py-2 text-xs tabular-nums text-slate-400">{__idx + 1}</td>
                  <td className="whitespace-nowrap px-5 py-2 font-semibold text-slate-800">
                    {i.name}{i.honorific ? <span className="ml-1 text-xs font-normal text-slate-400">{i.honorific}</span> : null}
                    {i.notionMissing && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600" title="노션에서 원본이 삭제되었습니다 — 필요 없으면 여기서 삭제하세요">⚠ 노션삭제</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600" title={[i.career, i.education].filter(Boolean).join(' · ') || undefined}>
                    {i.specialty || '-'}{i.level ? <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{i.level}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{i.phone || '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{maskResidentNumber(i.residentNumber)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {i.bankName && i.accountNumber ? `${i.bankName} ${i.accountNumber}` : '-'}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
      {/* 강사 상세 슬라이드 패널: 복원된 프로필 필드 + 참여 프로젝트/지급 이력 */}
      {panel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setPanel(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                {panel.name}{panel.honorific && <span className="ml-1 text-sm font-normal text-slate-400">{panel.honorific}</span>}
              </h3>
              <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ['전문분야', panel.specialty], ['등급', panel.level], ['연락처', panel.phone], ['이메일', panel.email],
                ['주소', panel.address],
                ['계좌', panel.bankName ? `${panel.bankName} ${panel.accountNumber ?? ''}` : undefined],
                ['경력', panel.career], ['학력', panel.education], ['비고', panel.remarks], ['특이사항', panel.specialNotes],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex gap-3 border-b border-slate-50 pb-2">
                  <dt className="w-16 shrink-0 text-xs font-medium text-slate-400">{k}</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">{v}</dd>
                </div>
              ))}
              {!panel.bankName && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">계좌 미등록 — 목록에서 연필 버튼으로 등록하세요</p>
              )}
            </dl>
            <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700">지급 이력</h4>
            {(() => {
              const rows = paymentRequests.filter((r) => r.payeeType === '강사' && r.payeeId === panel.id);
              if (rows.length === 0) return <p className="text-xs text-slate-400">연결된 지급 이력이 없습니다.</p>;
              return (
                <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <span className="flex-1 truncate text-slate-600">{r.projectName}</span>
                      <span className="font-medium text-slate-700">{r.amount.toLocaleString('ko-KR')}원</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${r.status === '지급완료' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {r.status === '지급완료' && r.paidMonth ? `지급/${Number(r.paidMonth.slice(5, 7))}월` : r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}
    </Card>
  );
}
