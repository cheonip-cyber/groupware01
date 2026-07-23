import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { useToast } from '../common/toast';
import { MoneyText } from '../common/MoneyText';
import { UploadCloud, X, Check, Loader2, ChevronDown } from 'lucide-react';

interface RecurringTemplate { category: string; description: string }

interface Candidate {
  key: string;
  transaction_date: string;
  rawDesc: string;
  recipient: string;
  amount: number;
  category: string;
  description: string;
  confidence: 'template' | 'keyword' | 'none'; // template=반복설정 정확매칭(자동선택), keyword=카테고리 추정만(수동선택), none=추정불가
  duplicate: boolean;
  likelyProject: boolean; // 같은 적요가 여러 수취인에게 반복 — 개인별 프로젝트성 지급으로 추정, 기본 별도 그룹
}

const CATEGORIES = ['급여/상여', '세금/공과', '대출/수수료', '렌탈/위탁', '임대료/관리비', '기기구입/기타'];

// 반복설정에 등록 안 돼 있어도 이름만으로 카테고리를 짐작할 수 있는 일반적인 회계 용어들.
// 템플릿 매칭(정확한 과거 이력)보다는 신뢰도가 낮아 기본 체크는 안 하되, 카테고리는 미리 채워둔다.
const KEYWORD_CATEGORY: [RegExp, string][] = [
  [/부가가치세|부가세|재산세|지방세|사업소득세|근로소득세|원천세|주민세|법인세|4대보험|국민연금|건강보험|고용보험|산재보험|사회보험/, '세금/공과'],
  [/관리비|임대료|월세/, '임대료/관리비'],
  [/렌트|리스|통신비|인터넷|정수기|구독료|이용료/, '렌탈/위탁'],
  [/급여|상여|퇴직/, '급여/상여'],
  [/이자|수수료|대출/, '대출/수수료'],
];

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

export function BankStatementImport({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showProjectGroup, setShowProjectGroup] = useState(false);
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

      const { data: templates } = await cardSupabase.from('recurring_settings').select('category, description');
      const tpls: RecurringTemplate[] = templates ?? [];

      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: existing } = await cardSupabase.from('manual_expenses').select('transaction_date, amount').gte('transaction_date', since);
      const existingKeys = new Set((existing ?? []).map((e: any) => `${e.transaction_date}_${Math.round(Number(e.amount))}`));

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
        const likelyProject = (descDayGroups.get(gk)?.size ?? 0) >= 3;

        let best: RecurringTemplate | null = null, bestScore = 0;
        for (const t of tpls) {
          const s = similarity(r.desc, t.description);
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

        return {
          key: `${r.date}_${r.desc}_${r.amount}_${r.row}`,
          transaction_date: r.date,
          rawDesc: r.desc,
          recipient: r.recipient,
          amount: r.amount,
          category,
          description: confidence === 'template' && best ? `${best.description}(${r.date.slice(5, 7)}월)` : r.desc,
          confidence,
          duplicate: existingKeys.has(`${r.date}_${Math.round(r.amount)}`),
          likelyProject,
        };
      });

      if (out.length === 0) throw new Error('추출 가능한 출금 내역이 없습니다.');
      setCandidates(out);
      // 자동 선택: 반복설정과 정확히 매칭되고, 중복 의심도 아니고, 프로젝트성으로 추정되지도 않는 건만
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
    setSaving(true);
    try {
      const payload = rows.map((c) => ({
        transaction_date: c.transaction_date, category: c.category, amount: c.amount,
        description: c.description || c.rawDesc, status: 'paid',
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

  const Row = ({ c }: { c: Candidate }) => (
    <tr className={`${c.duplicate ? 'bg-amber-50/40' : c.confidence === 'template' ? 'bg-blue-50/30' : c.confidence === 'keyword' ? 'bg-slate-50/60' : ''} hover:bg-slate-50`}>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} className="h-3.5 w-3.5" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{c.transaction_date}</td>
      <td className="px-2 py-1.5 text-slate-400">{c.rawDesc}{c.recipient && <span className="ml-1 text-slate-300">· {c.recipient}</span>}</td>
      <td className="px-2 py-1.5">
        <select value={c.category} onChange={(e) => updateCandidate(c.key, { category: e.target.value })}
          className="rounded border border-slate-200 px-1 py-0.5 text-xs outline-none">
          {CATEGORIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input value={c.description} onChange={(e) => updateCandidate(c.key, { description: e.target.value })}
          className="w-full min-w-[120px] rounded border border-slate-200 px-1.5 py-0.5 text-xs outline-none" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right"><MoneyText value={c.amount} className="text-xs" /></td>
    </tr>
  );

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
            <p className="text-xs text-slate-400">반복설정 항목과 자동 매칭된 건은 기본 선택되어 있습니다 — 추가 전 자유롭게 검토·수정하세요</p>
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
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />반복설정 정확 매칭(기본 선택)</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />용어로 카테고리만 추정(직접 확인 후 선택)</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />최근 90일 내 동일 날짜·금액 있음(중복 의심)</span>
            </p>
            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-slate-400">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 font-medium">일자</th>
                  <th className="px-2 py-2 font-medium">은행 적요 · 수취인</th>
                  <th className="px-2 py-2 font-medium">카테고리</th>
                  <th className="px-2 py-2 font-medium">내용</th>
                  <th className="px-2 py-2 text-right font-medium">금액</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {mainList.map((c) => <Row key={c.key} c={c} />)}
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
                        {projectList.map((c) => <Row key={c.key} c={c} />)}
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
