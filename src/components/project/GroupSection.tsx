import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project, RevenueDistribution } from '../../types';
import { dataSource } from '../../services/dataSource';
import { MoneyText } from '../common/MoneyText';
import { formatDate } from '../../utils/formatters';
import { GROUP_TYPE_LABEL } from './ProjectTable';
import { Layers, Plus, Search, Unlink, CornerDownRight, Pencil, Trash2, Check, X, Receipt, Wallet } from 'lucide-react';
import { useToast } from '../common/toast';

// 계열사 1행의 세금계산서/입금 완료 토글 — 체크와 동시에 날짜를 받는다 (상세화면·목록 펼침뷰 공용)
export function DistCompleteCell({ done, dateValue, onComplete, onUndo, label }:
  { done: boolean; dateValue?: string; onComplete: (date: string) => void; onUndo: () => void; label: string }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">✓ {dateValue ? formatDate(dateValue) : '완료'}</span>
        <button onClick={onUndo} className="text-[10px] text-slate-400 underline hover:text-red-500">취소</button>
      </span>
    );
  }
  if (picking) {
    return (
      <span className="inline-flex items-center gap-1">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded border border-slate-200 px-1.5 py-1 text-[11px] outline-none focus:border-indigo-400" />
        <button onClick={() => { onComplete(date); setPicking(false); }} className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700">확인</button>
        <button onClick={() => setPicking(false)} className="text-[11px] text-slate-400">취소</button>
      </span>
    );
  }
  return <button onClick={() => setPicking(true)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600">{label}</button>;
}

// 매출분배(계열사) 관리 — revenue_distributions 전용 테이블. 강사비/예산은 다루지 않고
// 세금계산서 발행·고객사 입금 두 가지만 계열사별로 관리한다. 전원 완료 시 DB 트리거가 마스터·노션에 자동 반영.
function DistributionSection({ project }: { project: Project }) {
  const toast = useToast();
  const [items, setItems] = useState<RevenueDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ client: '', amount: '', ratio: '' });

  const load = async () => { const d = await dataSource.getDistributions(project.id); setItems(d); setLoading(false); };
  useEffect(() => { load(); }, [project.id]);

  const total = items.reduce((s, d) => s + d.amount, 0);
  const allDone = items.length > 0 && items.every((d) => d.taxInvoiceIssued && d.paymentReceived);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e: any) { toast.error(`처리 실패: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">불러오는 중…</div>;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-indigo-400" />
        <h4 className="text-sm font-semibold text-slate-700">매출분배 (계열사)</h4>
        {items.length > 0 && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
            {items.length}개 계열사 · 합계 <MoneyText value={total} />
          </span>
        )}
        {items.length > 0 && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${allDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {allDone ? '전 계열사 정산 완료 — 마스터·노션 자동 반영됨' : '정산 진행 중'}
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-slate-400">계열사는 그룹웨어에서만 관리되며 노션에는 동기화되지 않습니다. 강사비·예산은 마스터 프로젝트에서만 관리합니다.</p>

      {items.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
              <th className="pb-2 font-medium">계열사</th>
              <th className="pb-2 font-medium">금액</th>
              <th className="pb-2 font-medium"><Receipt className="inline h-3 w-3" /> 세금계산서</th>
              <th className="pb-2 font-medium"><Wallet className="inline h-3 w-3" /> 입금</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((d) => (
              <tr key={d.id}>
                <td className="py-2 pr-2 font-medium text-slate-700">{d.clientName}{d.distributionRatio != null && <span className="ml-1 text-[10px] text-slate-400">{d.distributionRatio}%</span>}</td>
                <td className="py-2 pr-2"><MoneyText value={d.amount} className="text-xs" /></td>
                <td className="py-2 pr-2">
                  <DistCompleteCell done={d.taxInvoiceIssued} dateValue={d.taxInvoiceDate} label="발행"
                    onComplete={(date) => run(() => dataSource.updateDistribution(d.id, { taxInvoiceIssued: true, taxInvoiceDate: date }))}
                    onUndo={() => run(() => dataSource.updateDistribution(d.id, { taxInvoiceIssued: false, taxInvoiceDate: undefined }))} />
                </td>
                <td className="py-2 pr-2">
                  <DistCompleteCell done={d.paymentReceived} dateValue={d.paymentDate} label="입금"
                    onComplete={(date) => run(() => dataSource.updateDistribution(d.id, { paymentReceived: true, paymentDate: date }))}
                    onUndo={() => run(() => dataSource.updateDistribution(d.id, { paymentReceived: false, paymentDate: undefined }))} />
                </td>
                <td className="py-2 text-right">
                  <button disabled={busy} title="삭제"
                    onClick={() => { if (confirm(`'${d.clientName}' 항목을 삭제할까요?`)) run(() => dataSource.deleteDistribution(d.id)); }}
                    className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <label className="text-xs text-slate-500">계열사명<input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="정산 대상 계열사" className="ml-1 w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400" /></label>
          <label className="text-xs text-slate-500">금액(세전)<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="ml-1 w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400" /></label>
          <label className="text-xs text-slate-500">비율%<input type="number" value={form.ratio} onChange={(e) => setForm({ ...form, ratio: e.target.value })} placeholder="선택" className="ml-1 w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400" /></label>
          <button disabled={busy || !form.amount || !form.client.trim()}
            onClick={() => run(() => dataSource.addDistribution(project.id, { clientName: form.client, amount: Number(form.amount), distributionRatio: form.ratio ? Number(form.ratio) : undefined }).then(() => setForm({ client: '', amount: '', ratio: '' })))}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">추가</button>
          <button onClick={() => setAdding(false)} className="text-xs text-slate-400">닫기</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <Plus className="h-3 w-3" /> 계열사 추가
        </button>
      )}
    </div>
  );
}

/**
 * 프로젝트 그룹(묶음) 구성 섹션 — 구 시스템 모델 이식.
 * - 마스터: 구성 목록 + 회차 추가, 기존 프로젝트 묶기(merged), 매출분배(계열사) 관리, 자식 해제
 * - 자식: 소속 그룹 링크
 * 통계 규칙: 자식이 금액을 가지면 마스터의 유효매출은 0 (이중계상 방지)
 * 매출분배는 projects 테이블 자식이 아닌 별도 테이블(revenue_distributions)로 관리한다 — DistributionSection 참조.
 */
export function GroupSection({ project, allProjects, onChanged }: {
  project: Project;
  allProjects: Project[];
  onChanged: () => Promise<void>;
}) {
  const children = useMemo(
    () => allProjects.filter((p) => p.parentId === project.id),
    [allProjects, project.id],
  );
  const master = useMemo(
    () => (project.parentId ? allProjects.find((p) => p.id === project.parentId) : undefined),
    [allProjects, project.parentId],
  );

  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ amount: '', date: '', name: '' });
  const [mode, setMode] = useState<'' | 'merged' | 'recurring'>('');
  const [query, setQuery] = useState('');
  const [occ, setOcc] = useState({ no: String(children.length + 1), amount: '', date: '' });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await onChanged(); toast.success('그룹 구성이 변경되었습니다'); }
    catch (e: any) {
      toast.error(`처리 실패: ${e?.message ?? e}`);
      // 서버 가드에 걸린 경우 화면이 오래된 상태일 수 있으므로 즉시 최신화 (예: 이 프로젝트가 방금 다른 그룹의 자식이 된 경우)
      await onChanged().catch(() => {});
    }
    finally { setBusy(false); }
  };

  // 매출분배 마스터: 별도 컴포넌트로 위임 (projects 자식이 아닌 revenue_distributions 관리)
  if (project.groupType === 'distribution' && !project.parentId) {
    return <DistributionSection project={project} />;
  }

  // ── 자식 프로젝트인 경우: 소속 그룹 표시 ──
  if (project.parentId) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-indigo-400" />
          <span className="text-slate-500">소속 그룹:</span>
          {master ? (
            <Link to={`/projects/${master.id}`} className="font-medium text-indigo-700 underline">{master.projectName}</Link>
          ) : <span className="text-slate-400">(마스터 조회 불가)</span>}
          {project.groupType && (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">
              {GROUP_TYPE_LABEL[project.groupType] ?? project.groupType}
            </span>
          )}
          <button disabled={busy} onClick={() => { if (confirm('이 프로젝트를 그룹에서 해제할까요?')) run(() => dataSource.detachFromGroup(project.id)); }}
            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:text-red-500">
            <Unlink className="h-3 w-3" /> 그룹 해제
          </button>
        </div>
      </div>
    );
  }

  // ── 마스터/독립 프로젝트: 구성 + 관리 ──
  const groupTotal = children.reduce((s, c) => s + (c.contractAmount || 0), 0);
  const mergeCandidates = query.trim()
    ? allProjects.filter((p) =>
        p.id !== project.id && !p.parentId && (p.groupChildCount ?? 0) === 0 &&
        p.projectName.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const addOccurrence = () => {
    const name = `${project.projectName} (${occ.no}회차)`;
    if (children.some((c) => c.projectName === name)) {
      toast.error(`"${occ.no}회차"가 이미 존재합니다. 회차 번호를 확인하세요.`);
      return;
    }
    return run(() => dataSource.createGroupChild(project.id, {
    groupType: 'recurring',
    projectName: `${project.projectName} (${occ.no}회차)`,
    amount: Number(occ.amount),
    executionDate: occ.date || undefined,
    masterClientId: project.clientId || undefined,
    masterStatus: undefined,
    masterVatType: project.vatType,
    masterRevenueMonth: project.revenueMonth,
    }).then(() => setOcc({ no: String(Number(occ.no) + 1), amount: '', date: '' })));
  };

  const inputCls = 'rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-indigo-400" />
        <h4 className="text-sm font-semibold text-slate-700">그룹 구성</h4>
        {project.groupType && children.length > 0 && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
            {GROUP_TYPE_LABEL[project.groupType] ?? project.groupType} · {children.length}건 · 합계 <MoneyText value={groupTotal} />
          </span>
        )}
        {children.length > 0 && (
          <span className="text-[11px] text-slate-400">통계에는 구성(자식) 금액만 반영되어 이중계상이 없습니다</span>
        )}
      </div>

      {children.length > 0 && (
        <ul className="mb-4 divide-y divide-indigo-100 rounded-lg border border-indigo-200 bg-indigo-50/40">
          {children.map((c) => {
            const editable = !c.notionPageId; // 노션 연동 자식은 노션이 원천이므로 수정 잠금
            const deletable = c.sourceType === 'manual_groupware' && !c.notionPageId;
            const editing = editId === c.id;
            return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <CornerDownRight className="h-3.5 w-3.5 text-slate-300" />
              <Link to={`/projects/${c.id}`} className="font-medium text-slate-700 hover:text-indigo-600">{c.projectName}</Link>
              <span className="text-xs text-slate-400">{c.clientName}</span>
              {editing ? (
                <span className="ml-auto flex items-center gap-1.5">
                  {c.groupType !== 'merged' && (
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      title="회차명 수정 (예: 3회차 → 4회차)"
                      className="w-52 rounded-lg border border-indigo-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
                  )}
                  <input type="number" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
                    placeholder="금액(세전)" className="w-28 rounded-lg border border-indigo-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
                  <input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                    className="rounded-lg border border-indigo-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
                  <button disabled={busy || !edit.amount} title="저장"
                    onClick={() => run(() => dataSource.updateProject(c.id, { finalEstimate: Number(edit.amount), startDate: edit.date || undefined, ...(c.groupType !== 'merged' && edit.name.trim() ? { projectName: edit.name.trim() } : {}) }).then(() => setEditId(null)))}
                    className="rounded bg-indigo-600 p-1 text-white hover:bg-indigo-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                  <button title="취소" onClick={() => setEditId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
                </span>
              ) : (
                <>
                  {c.startDate && <span className="text-[11px] text-slate-400">{formatDate(c.startDate)}</span>}
                  <span className="ml-auto"><MoneyText value={c.finalEstimate ?? c.contractAmount} className="text-sm" /><span className="ml-0.5 text-[10px] text-slate-400">세전</span></span>
                  {editable && (
                    <button disabled={busy} title="금액·시행일 수정"
                      onClick={() => { setEditId(c.id); setEdit({ amount: String(c.finalEstimate ?? ''), date: c.startDate ?? '', name: c.projectName }); }}
                      className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" /></button>
                  )}
                  <button disabled={busy} title="그룹에서 해제"
                    onClick={() => { if (confirm(`'${c.projectName}'을(를) 그룹에서 해제할까요? (프로젝트는 목록에 남습니다)`)) run(() => dataSource.detachFromGroup(c.id)); }}
                    className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-amber-500"><Unlink className="h-3.5 w-3.5" /></button>
                  {deletable && (
                    <button disabled={busy} title="구성 삭제 (앱에서 생성한 항목, 비용 없음일 때만)"
                      onClick={() => { if (confirm(`'${c.projectName}'을(를) 완전히 삭제할까요? 이 동작은 되돌릴 수 없습니다.`)) run(() => dataSource.deleteGroupChild(c.id)); }}
                      className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </>
              )}
            </li>
          ); })}
        </ul>
      )}

      {/* 그룹 관리 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">추가:</span>
        {(['merged', 'recurring'] as const).map((m) => (
          <button key={m} onClick={() => setMode(mode === m ? '' : m)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${mode === m ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {m === 'merged' ? '기존 프로젝트 묶기' : '회차 추가'}
          </button>
        ))}
        {!project.groupType && (
          <span className="text-xs text-slate-300">|</span>
        )}
        {!project.groupType && (
          <button onClick={() => setMode(mode === ('distribution' as any) ? '' : ('distribution' as any))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            매출분배 추가
          </button>
        )}
      </div>

      {mode === 'merged' && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="묶을 프로젝트명 검색"
              className={`${inputCls} w-full pl-8`} />
          </div>
          {mergeCandidates.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {mergeCandidates.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{p.projectName}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.sourceType === 'legacy_public' ? 'bg-slate-100 text-slate-500' : p.sourceType === 'notion' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                    {p.sourceType === 'legacy_public' ? '과거이관' : p.sourceType === 'notion' ? '노션' : '수기'}
                  </span>
                  <span className="text-xs text-slate-400">{p.clientName} · {p.revenueMonth ?? '-'} · <MoneyText value={p.contractAmount} /></span>
                  <button disabled={busy}
                    onClick={() => run(() => dataSource.attachProjectsToGroup(project.id, [p.id], 'merged'))}
                    className="ml-auto flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700">
                    <Plus className="h-3 w-3" /> 묶기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'recurring' && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <label className="text-xs text-slate-500">회차<input value={occ.no} onChange={(e) => setOcc({ ...occ, no: e.target.value })} className={`${inputCls} ml-1 w-14`} /></label>
          <label className="text-xs text-slate-500">금액(세전)<input type="number" value={occ.amount} onChange={(e) => setOcc({ ...occ, amount: e.target.value })} placeholder="0" className={`${inputCls} ml-1 w-32`} /></label>
          <label className="text-xs text-slate-500">시행일<input type="date" value={occ.date} onChange={(e) => setOcc({ ...occ, date: e.target.value })} className={`${inputCls} ml-1`} /></label>
          <button disabled={busy || !occ.amount || !occ.no} onClick={addOccurrence}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">회차 추가</button>
          <span className="text-[11px] text-slate-400">"{project.projectName} ({occ.no}회차)" 로 생성 · 고객사는 마스터와 동일 · 노션 비동기화(그룹웨어 전용)</span>
        </div>
      )}

      {(mode as any) === 'distribution' && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-500">
          매출분배는 계열사를 처음 추가하는 순간부터 아래 전용 화면으로 전환됩니다. 저장을 눌러 첫 계열사를 등록하면 이 그룹이 "매출분배" 유형으로 확정됩니다.
          <div className="mt-2">
            <FirstDistributionForm project={project} onCreated={onChanged} />
          </div>
        </div>
      )}
    </div>
  );
}

// 매출분배 첫 계열사 등록 폼 (그룹 유형이 아직 비어있는 프로젝트에서 최초 1건 추가)
function FirstDistributionForm({ project, onCreated }: { project: Project; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ client: '', amount: '', ratio: '' });
  const [busy, setBusy] = useState(false);
  const inputCls = 'rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400';
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">계열사명<input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="정산 대상 계열사" className={`${inputCls} ml-1 w-40`} /></label>
      <label className="text-xs text-slate-500">금액(세전)<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className={`${inputCls} ml-1 w-32`} /></label>
      <label className="text-xs text-slate-500">비율%<input type="number" value={form.ratio} onChange={(e) => setForm({ ...form, ratio: e.target.value })} placeholder="선택" className={`${inputCls} ml-1 w-20`} /></label>
      <button disabled={busy || !form.amount || !form.client.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await dataSource.addDistribution(project.id, { clientName: form.client, amount: Number(form.amount), distributionRatio: form.ratio ? Number(form.ratio) : undefined });
            await onCreated();
            toast.success('매출분배가 시작되었습니다');
          } catch (e: any) { toast.error(`처리 실패: ${e?.message ?? e}`); }
          finally { setBusy(false); }
        }}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">첫 계열사 등록</button>
    </div>
  );
}
