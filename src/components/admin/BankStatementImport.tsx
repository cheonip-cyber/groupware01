import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { useToast } from '../common/toast';
import { MoneyText } from '../common/MoneyText';
import { UploadCloud, X, Check, Loader2, ChevronDown } from 'lucide-react';
import { formatDescription, itemMonthKey, type FixedCostRule, type MonthBasis } from '../../utils/fixedCost';
import { useEscClose } from '../../hooks/useEscClose';
import { useDialog } from '../common/dialog';

// 고정비 통합 정의표(recurring_checklist_items) 기반 템플릿 (2026-07-27)
// — 고정비 체크리스트와 같은 정의를 공유해, 자동등록 결과가 체크리스트 상태에 그대로 반영되게 한다.
interface RecurringTemplate {
  itemId: number;       // 고정비 항목 id — 등록 시 manual_expenses.recurring_id에 기록
  category: string;
  label: string;        // 정식명칭 (등록 시 description 정규화에 사용)
  aliases: string[];    // 은행 적요 표기 흡수용 별칭 (정식명칭 포함)
  rule: FixedCostRule;  // 표기·중복 판정 규칙
}

interface Candidate {
  key: string;
  transaction_date: string;
  rawDesc: string;
  recipient: string;
  amount: number;
  category: string;
  description: string;
  confidence: 'template' | 'keyword' | 'none'; // template=고정비 정의표 정확매칭(자동선택), keyword=카테고리 추정만(수동선택), none=추정불가
  duplicate: boolean;
  likelyProject: boolean; // 같은 적요가 여러 수취인에게 반복 — 개인별 프로젝트성 지급으로 추정, 기본 별도 그룹
  recurringId: number | null; // 고정비 항목 링크(사용자가 드롭다운으로 확정·수정 가능)
}

interface FixedCostItem { id: number; label: string; category: string; rule: FixedCostRule }

const CATEGORIES = ['급여/상여', '세금/공과', '대출/수수료', '렌탈/위탁', '임대료/관리비', '기기구입/기타'];

// 고정비 정의표에 등록 안 돼 있어도 이름만으로 카테고리를 짐작할 수 있는 일반적인 회계 용어들.
// 템플릿 매칭(정확한 과거 이력)보다는 신뢰도가 낮아 기본 체크는 안 하되, 카테고리는 미리 채워둔다.
const KEYWORD_CATEGORY: [RegExp, string][] = [
  [/부가가치세|부가세|재산세|지방세|사업소득세|근로소득세|원천세|주민세|법인세|4대보험|국민연금|건강보험|고용보험|산재보험|사회보험/, '세금/공과'],
  [/관리비|임대료|월세/, '임대료/관리비'],
  [/렌트|리스|통신비|인터넷|정수기|구독료|이용료/, '렌탈/위탁'],
  [/급여|상여|퇴직/, '급여/상여'],
  [/이자|수수료|대출/, '대출/수수료'],
];
// 급여/상여 성격 적요는 '같은 날 같은 적요로 3명 이상에게 지급 = 프로젝트성 지급(강사료 등)'
// 추정 규칙에서 제외한다. 직원 여러 명에게 같은 날 같은 적요("급여" 등)로 지급하는 게
// 정상적인 급여 지급 패턴인데, 이 규칙에 걸려 카테고리는 맞게 잡히면서도 자동선택 목록에서만
// 빠져 등록 누락으로 이어지고 있었음(2026-08-21 수정).
const SALARY_RE = /급여|상여|퇴직/;

function normalize(s: string): string {
  return s.replace(/\([^)]*\)/g, '').replace(/[0-9./\-\s]/g, '');
}
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function similarity(a: string, b: string): number {
  const A = bigrams(normalize(a)), B = bigrams(normalize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / Math.min(A.size, B.size);
}

function findHeaderRow(rows: any[][]): number {
  return rows.findIndex((r) => r.some((c) => String(c ?? '').includes('거래일시')) && r.some((c) => String(c ?? '').includes('적요')));
}

function excelDateToStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '');
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

function Row({ c, selected, onToggle, onUpdate, items }: {
  c: Candidate; selected: boolean; onToggle: (key: string) => void; onUpdate: (key: string, patch: Partial<Candidate>) => void;
  items: FixedCostItem[];
}) {
  // 고정비 항목을 지정/변경하면 카테고리·내용도 그 항목의 정식 표기로 함께 맞춘다
  const onPickItem = (raw: string) => {
    if (!raw) { onUpdate(c.key, { recurringId: null }); return; }
    const it = items.find((i) => i.id === Number(raw));
    if (!it) return;
    onUpdate(c.key, {
      recurringId: it.id,
      category: it.category,
      description: formatDescription(it.rule, c.transaction_date),
    });
  };
  return (
    <tr className={`${c.duplicate ? 'bg-amber-50/40' : c.confidence === 'template' ? 'bg-blue-50/30' : c.confidence === 'keyword' ? 'bg-slate-50/60' : ''} hover:bg-slate-50`}>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={selected} onChange={() => onToggle(c.key)} className="h-3.5 w-3.5" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{c.transaction_date}</td>
      <td className="px-2 py-1.5 text-slate-400">{c.rawDesc}{c.recipient && <span className="ml-1 text-slate-300">· {c.recipient}</span>}</td>
      <td className="px-2 py-1.5">
        <select value={c.category} onChange={(e) => onUpdate(c.key, { category: e.target.value })}
          className="rounded border border-slate-200 px-1 py-0.5 text-xs outline-none">
          {CATEGORIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input value={c.description} onChange={(e) => onUpdate(c.key, { description: e.target.value })}
          className="w-full min-w-[120px] rounded border border-slate-200 px-1.5 py-0.5 text-xs outline-none" />
      </td>
      <td className="px-2 py-1.5">
        <select value={c.recurringId ?? ''} onChange={(e) => onPickItem(e.target.value)}
          title="고정비 항목으로 지정하면 고정비 체크리스트에 자동 반영됩니다"
          className={`rounded border px-1 py-0.5 text-xs outline-none ${c.recurringId ? 'border-blue-200 bg-blue-50/60 text-blue-700' : 'border-slate-200 text-slate-400'}`}>
          <option value="">— (일반 지출)</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right"><MoneyText value={c.amount} className="text-xs" /></td>
    </tr>
  );
}

export function BankStatementImport({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  useEscClose(!!candidates, () => setCandidates(null)); // 모든 팝업 ESC 닫기 (과거 확정 요청)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showProjectGroup, setShowProjectGroup] = useState(false);
  const [fixedItems, setFixedItems] = useState<FixedCostItem[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

      const headerIdx = findHeaderRow(rows);
      if (headerIdx === -1) throw new Error('은행 거래내역 형식을 인식하지 못했습니다 ("거래일시", "적요" 컬럼을 찾을 수 없음)');
      const header = rows[headerIdx].map((h) => String(h ?? '').trim());
      const col = (name: string) => header.findIndex((h) => h === name || h.includes(name));
      const iDate = col('거래일시'), iDesc = col('적요'), iOut = col('출금'), iTo = col('의뢰인/수취인');
      if (iDate === -1 || iDesc === -1 || iOut === -1) throw new Error('필수 컬럼(거래일시/적요/출금)을 찾지 못했습니다.');

      // 고정비 통합 정의표에서 템플릿을 읽는다 (구 recurring_settings 대체)
      const { data: templates } = await cardSupabase
        .from('recurring_checklist_items')
        .select('id, label, category, desc_pattern, match_groups, month_basis, month_suffix, one_per_month')
        .eq('is_active', true)
        .order('sort_order');
      const ruleOf = (t: any): FixedCostRule => ({
        label: t.label,
        month_basis: (t.month_basis ?? 'payment') as MonthBasis,
        month_suffix: t.month_suffix ?? '월',
        one_per_month: t.one_per_month ?? true,
      });
      setFixedItems((templates ?? []).map((t: any) => ({ id: t.id, label: t.label, category: t.category, rule: ruleOf(t) })));
      const tpls: RecurringTemplate[] = (templates ?? []).flatMap((t: any) => {
        const groups: string[][] = Array.isArray(t.match_groups) && t.match_groups.length > 0
          ? t.match_groups
          : String(t.desc_pattern ?? '').split(',').map((s: string) => s.trim()).filter(Boolean).map((s: string) => [s]);
        // 그룹이 여러 개인 항목(예: 사업소득세+지방세+근로소득세)은 그룹별로 각각의 템플릿이 된다
        return groups.map((aliases) => ({
          itemId: t.id as number,
          category: t.category,
          label: aliases[0],
          aliases: aliases.filter(Boolean),
          // 그룹이 여러 개인 항목은 그룹 명칭(별칭 대표)을 표기에 사용
          rule: { ...ruleOf(t), label: aliases[0] },
        }));
      });

      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: existing } = await cardSupabase.from('manual_expenses')
        .select('transaction_date, amount, recurring_id').gte('transaction_date', since);
      const existingKeys = new Set((existing ?? []).map((e: any) => `${e.transaction_date}_${Math.round(Number(e.amount))}`));
      // 월 1건만 정상인 고정비 항목은 '같은 항목 + 같은 대상 월'이 이미 있으면 금액·날짜가 달라도 중복으로 본다.
      // (급여·사업소득세처럼 월 다건이 정상인 항목은 one_per_month=false라 대상에서 제외)
      const ruleById = new Map<number, FixedCostRule>();
      (templates ?? []).forEach((t: any) => ruleById.set(t.id, ruleOf(t)));
      const existingItemMonths = new Set(
        (existing ?? [])
          .filter((e: any) => e.recurring_id != null && ruleById.get(e.recurring_id)?.one_per_month)
          .map((e: any) => itemMonthKey(e.recurring_id, e.transaction_date, ruleById.get(e.recurring_id)!.month_basis)),
      );

      type Raw = { date: string; desc: string; recipient: string; amount: number; row: number };
      const raws: Raw[] = [];
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const desc = String(row[iDesc] ?? '').trim();
        const amount = Number(row[iOut]);
        const date = excelDateToStr(row[iDate]);
        const recipient = iTo !== -1 ? String(row[iTo] ?? '').trim() : '';
        if (!date || !desc || !amount || Number.isNaN(amount) || amount <= 0) continue;
        raws.push({ date, desc, recipient, amount, row: r });
      }

      // 같은 날짜에 같은 적요가 서로 다른 수취인 3명 이상에게 반복되면 —
      // 개인별 강사료/참가비 등 프로젝트성 지급일 가능성이 높다고 보고 별도로 분리한다.
      const descDayGroups = new Map<string, Set<string>>();
      for (const r of raws) {
        const gk = `${r.date}_${normalize(r.desc)}`;
        if (!descDayGroups.has(gk)) descDayGroups.set(gk, new Set());
        if (r.recipient) descDayGroups.get(gk)!.add(r.recipient);
      }

      const out: Candidate[] = raws.map((r) => {
        const gk = `${r.date}_${normalize(r.desc)}`;
        const likelyProject = !SALARY_RE.test(r.desc) && (descDayGroups.get(gk)?.size ?? 0) >= 3;

        let best: RecurringTemplate | null = null, bestScore = 0;
        for (const t of tpls) {
          // 별칭이 적요에 그대로 포함되면 확정 매칭(1.0), 아니면 별칭별 유사도 중 최댓값
          const contains = t.aliases.some((a) => r.desc.includes(a));
          const s = contains ? 1 : Math.max(0, ...t.aliases.map((a) => similarity(r.desc, a)));
          if (s > bestScore) { bestScore = s; best = t; }
        }
        const templateMatched = bestScore >= 0.34;

        let category = '';
        let confidence: Candidate['confidence'] = 'none';
        if (templateMatched && best) {
          category = best.category; confidence = 'template';
        } else {
          const kw = KEYWORD_CATEGORY.find(([re]) => re.test(r.desc));
          if (kw) { category = kw[1]; confidence = 'keyword'; }
        }
        if (!category) category = CATEGORIES[0];

        const matchedItemId = confidence === 'template' && best ? best.itemId : null;
        // 중복 판정: ① 최근 90일 내 동일 날짜·금액 ② 월 1건 항목의 같은 대상 월 기등록
        const dupByAmount = existingKeys.has(`${r.date}_${Math.round(r.amount)}`);
        const dupByItemMonth = !!(matchedItemId && best?.rule.one_per_month
          && existingItemMonths.has(itemMonthKey(matchedItemId, r.date, best.rule.month_basis)));

        return {
          key: `${r.date}_${r.desc}_${r.amount}_${r.row}`,
          transaction_date: r.date,
          rawDesc: r.desc,
          recipient: r.recipient,
          amount: r.amount,
          category,
          // 매칭된 건은 항목별 표기 규칙으로 정규화(원본 은행 적요는 raw_description에 보존)
          // 예: 사무실관리비는 전월 요금을 당월 납부 → 7/23 지급분은 '사무실관리비(6월분)'
          description: confidence === 'template' && best ? formatDescription(best.rule, r.date) : r.desc,
          confidence,
          duplicate: dupByAmount || dupByItemMonth,
          likelyProject,
          recurringId: matchedItemId,
        };
      });

      if (out.length === 0) throw new Error('추출 가능한 출금 내역이 없습니다.');
      setCandidates(out);
      // 자동 선택: 고정비 정의표와 정확히 매칭되고, 중복 의심도 아니고, 프로젝트성으로 추정되지도 않는 건만
      setSelected(new Set(out.filter((c) => c.confidence === 'template' && !c.duplicate && !c.likelyProject).map((c) => c.key)));
      setShowProjectGroup(false);
    } catch (e: any) {
      toast.error(e?.message ?? '파일을 분석하지 못했습니다.');
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  };

  const updateCandidate = (key: string, patch: Partial<Candidate>) => {
    setCandidates((prev) => prev ? prev.map((c) => (c.key === key ? { ...c, ...patch } : c)) : prev);
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const commit = async () => {
    if (!candidates) return;
    const rows = candidates.filter((c) => selected.has(c.key));
    if (rows.length === 0) return;
    // 중복 의심 건이 선택돼 있으면 저장 전에 한 번 막는다(이미 등록된 고정비 재등록 방지)
    const dups = rows.filter((c) => c.duplicate);
    if (dups.length > 0) {
      const preview = dups.slice(0, 5).map((c) => `· ${c.transaction_date} ${c.description || c.rawDesc}`).join('\n');
      const more = dups.length > 5 ? `\n… 외 ${dups.length - 5}건` : '';
      if (!await dialog.confirm(`이미 등록된 것으로 보이는 ${dups.length}건이 선택되어 있습니다.\n\n${preview}${more}\n\n그래도 추가할까요?`)) return;
    }
    setSaving(true);
    try {
      const payload = rows.map((c) => ({
        transaction_date: c.transaction_date, category: c.category, amount: c.amount,
        description: c.description || c.rawDesc, status: 'paid',
        raw_description: c.rawDesc, // 원본 은행 적요 보존(표시는 정식명칭으로 정규화)
        recurring_id: c.recurringId, // 고정비 항목 링크 — 체크리스트 상태가 이 값으로 확정 판정됨
      }));
      const { error } = await cardSupabase.from('manual_expenses').insert(payload);
      if (error) throw error;
      toast.success(`${rows.length}건 추가되었습니다`);
      setCandidates(null);
      setSelected(new Set());
      onImported();
    } catch (e: any) {
      toast.error(`추가 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const mainList = candidates?.filter((c) => !c.likelyProject) ?? [];
  const projectList = candidates?.filter((c) => c.likelyProject) ?? [];

  // 전체선택은 중복 의심 건을 제외한다 — 전체선택 한 번으로 중복이 그대로 저장되던 문제 방지
  const selectableMain = mainList.filter((c) => !c.duplicate);
  const allMainChecked = selectableMain.length > 0 && selectableMain.every((c) => selected.has(c.key));
  const toggleAllMain = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allMainChecked) mainList.forEach((c) => next.delete(c.key));
      else selectableMain.forEach((c) => next.add(c.key));
      return next;
    });
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <input ref={inputRef} type="file" accept=".xls,.xlsx" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; }} />
        {parsing ? (
          <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 분석 중…</span>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-slate-300" />
            <p className="text-sm text-slate-500">은행 이체내역 엑셀(.xls/.xlsx)을 여기로 끌어다 놓거나 클릭해서 선택하세요</p>
            <p className="text-xs text-slate-400">고정비 항목과 자동 매칭된 건은 기본 선택되어 있습니다 — 추가 전 자유롭게 검토·수정하세요</p>
          </>
        )}
      </div>

      {candidates && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-[2px]" onClick={() => setCandidates(null)}>
          <div className="modal-pop flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">추출된 출금 내역 ({candidates.length}건) — {selected.size}건 선택됨</h3>
              <button onClick={() => setCandidates(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-2 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />고정비 정의표 매칭(기본 선택)</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />용어로 카테고리만 추정(직접 확인 후 선택)</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />최근 90일 내 동일 날짜·금액 있음(중복 의심)</span>
            </p>
            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-slate-400">
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" checked={allMainChecked} onChange={toggleAllMain} className="h-3.5 w-3.5" title="전체 선택/해제" />
                  </th>
                  <th className="px-2 py-2 font-medium">일자</th>
                  <th className="px-2 py-2 font-medium">은행 적요 · 수취인</th>
                  <th className="px-2 py-2 font-medium">카테고리</th>
                  <th className="px-2 py-2 font-medium">내용</th>
                  <th className="px-2 py-2 font-medium">고정비 항목</th>
                  <th className="px-2 py-2 text-right font-medium">금액</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {mainList.map((c) => <Row key={c.key} c={c} selected={selected.has(c.key)} onToggle={toggle} onUpdate={updateCandidate} items={fixedItems} />)}
                </tbody>
              </table>
              {projectList.length > 0 && (
                <div className="border-t border-slate-100">
                  <button type="button" onClick={() => setShowProjectGroup((v) => !v)}
                    className="flex w-full items-center gap-1.5 bg-slate-50 px-3 py-2 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-100">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showProjectGroup ? '' : '-rotate-90'}`} />
                    프로젝트 관련(강사료·참가비 등) 추정 {projectList.length}건 — 같은 내용이 여러 수취인에게 반복되어 판관비가 아닐 가능성이 높습니다. 기본 제외됨, 필요 시 펼쳐서 개별 선택하세요.
                  </button>
                  {showProjectGroup && (
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-50">
                        {projectList.map((c) => <Row key={c.key} c={c} selected={selected.has(c.key)} onToggle={toggle} onUpdate={updateCandidate} items={fixedItems} />)}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">체크된 건은 은행에서 이미 이체 완료된 내역이므로 "지급완료" 상태로 등록됩니다.</p>
              <span className="flex gap-2">
                <button onClick={() => setCandidates(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">취소</button>
                <button onClick={commit} disabled={saving || selected.size === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  선택 {selected.size}건 추가
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
