import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEscClose } from '../../hooks/useEscClose';
import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { Users, Plus, Trash2, X } from 'lucide-react';
import type { Instructor } from '../../types';
import { maskResidentNumber } from '../../utils/withholding';
import { useToast } from '../common/toast';
import { SavingLabel } from '../common/SavingLabel';
import { activePayments } from '../../utils/filters';
import { useDialog } from '../common/dialog';

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
  const { instructors, paymentRequests, projects, loading, addInstructor, updateInstructor, deleteInstructor } = useAppData();
  const toast = useToast();
  const dialog = useDialog();
  const [panel, setPanel] = useState<Instructor | null>(null);       // 상세 슬라이드 패널
  // 패널에서 바로 수정 — 목록 인라인 편집에는 주소 칸이 없어 등록 후 주소를 넣을 방법이 없었다.
  const [panelForm, setPanelForm] = useState<Record<string, string>>({});
  const [panelSaving, setPanelSaving] = useState(false);
  const openPanel = (i: Instructor) => {
    setPanel(i);
    setPanelForm({
      name: i.name ?? '', phone: i.phone ?? '', email: i.email ?? '',
      residentNumber: i.residentNumber ?? '', address: i.address ?? '',
      bankName: i.bankName ?? '', accountNumber: i.accountNumber ?? '',
      specialty: i.specialty ?? '', level: i.level ?? '', career: i.career ?? '',
      education: i.education ?? '', honorific: i.honorific ?? '',
      remarks: i.remarks ?? '', specialNotes: i.specialNotes ?? '',
    });
  };
  // 다른 화면(업무관리>강사 섭외 현황 등)에서 강사명을 눌러 들어온 경우 ?highlight=ID로
  // 해당 강사 상세 패널을 자동으로 연다(2026-08-21 추가).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId || loading) return;
    const target = instructors.find((i) => String(i.id) === highlightId);
    if (target) {
      openPanel(target);
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, instructors, loading]);
  /** 패널 저장 — 값이 바뀐 항목만 보낸다. 지급 이력 등 연결 데이터는 id로 이어져 있어 영향받지 않는다. */
  const savePanel = async () => {
    if (!panel) return;
    setPanelSaving(true);
    try {
      const patch: Record<string, string | undefined> = {};
      const cur: Record<string, string> = {
        name: panel.name ?? '', phone: panel.phone ?? '', email: panel.email ?? '',
        residentNumber: panel.residentNumber ?? '', address: panel.address ?? '',
        bankName: panel.bankName ?? '', accountNumber: panel.accountNumber ?? '',
        specialty: panel.specialty ?? '', level: panel.level ?? '', career: panel.career ?? '',
        education: panel.education ?? '', honorific: panel.honorific ?? '',
        remarks: panel.remarks ?? '', specialNotes: panel.specialNotes ?? '',
      };
      for (const k of Object.keys(cur)) {
        if ((panelForm[k] ?? '') !== cur[k]) patch[k] = panelForm[k] || undefined;
      }
      if (Object.keys(patch).length === 0) { toast.error('변경된 내용이 없습니다'); return; }
      if (patch.name !== undefined && !panelForm.name.trim()) { toast.error('이름은 비울 수 없습니다'); return; }
      await updateInstructor(panel.id, patch as any);
      setPanel((cur2) => (cur2 ? { ...cur2, ...(patch as any) } : cur2));
      toast.success('저장되었습니다');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다');
    } finally { setPanelSaving(false); }
  };
  useEscClose(!!panel, () => setPanel(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)
  const [noAccountOnly, setNoAccountOnly] = useState(false);          // 계좌 미등록 필터 (76명 정비용)
  const [query, setQuery] = useState('');                              // 이름/분야/연락처 검색
  const [sortKey, setSortKey] = useState<'name' | 'specialty'>('name');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SensitiveForm>(emptyForm);


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
    if (!await dialog.confirm(`'${name}' 강사를 삭제할까요?`, { tone: 'danger', confirmText: '삭제' })) return;
    await deleteInstructor(id);
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
          <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
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
              <tr><td colSpan={7} className="px-5 py-6 text-center text-xs text-slate-400">'{query}' 검색 결과가 없습니다 — 방금 등록했다면 새로고침 후 다시 검색해 보세요</td></tr>
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
              return (
                <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openPanel(i)}>
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
        <div className="modal-overlay fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setPanel(null)}>
          <div className="modal-slide h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">
                {panel.name}{panel.honorific && <span className="ml-1 text-sm font-normal text-slate-400">{panel.honorific}</span>}
              </h3>
              <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {/* 노션 동기화 범위 안내 — 개인정보는 그룹웨어에서만 관리한다 */}
            <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-800">
              노션과 동기화되는 항목은 <b>성명·연락처·이메일·강의주제</b>뿐입니다. 개인정보 보호를 위해
              주민등록번호·주소·계좌 등은 노션으로 전송되지 않으며, 이 화면에서만 관리됩니다.
            </p>

            <div className="space-y-3">
              {/* 2026-08-21: 전문분야·등급·경력 등은 예전엔 "노션이 원본"이라 읽기전용이었으나,
                  해당 노션 매핑이 전부 비활성화(또는 애초에 매핑 없음)된 상태임을 확인하고
                  편집 가능으로 전환. 노션과는 연락처/성명만 동기화되므로 여기서 고쳐도
                  동기화로 되돌아가지 않는다. */}
              {([
                ['이름', 'name', 'text'],
                ['호칭', 'honorific', 'text'],
                ['연락처', 'phone', 'text'], ['이메일', 'email', 'text'],
                ['주민등록번호', 'residentNumber', 'text'],
                ['주소', 'address', 'text'],
                ['은행', 'bankName', 'text'], ['계좌번호', 'accountNumber', 'text'],
                ['전문분야', 'specialty', 'text'], ['등급', 'level', 'text'],
                ['경력', 'career', 'area'], ['학력', 'education', 'area'],
                ['비고', 'remarks', 'area'], ['특이사항', 'specialNotes', 'area'],
              ] as [string, string, string][]).map(([label, key, kind]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">{label}</span>
                  {kind === 'area'
                    ? <textarea rows={2} value={panelForm[key] ?? ''}
                        onChange={(e) => setPanelForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400" />
                    : <input value={panelForm[key] ?? ''}
                        onChange={(e) => setPanelForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400" />}
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

            <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700">지급 이력</h4>
            {(() => {
              const rows = activePayments(paymentRequests, projects).filter((r) => r.payeeType === '강사' && r.payeeId === panel.id);
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
