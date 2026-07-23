import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { useToast } from '../common/toast';
import { MoneyText } from '../common/MoneyText';
import { UploadCloud, X, Check, Loader2 } from 'lucide-react';

interface RecurringTemplate { category: string; description: string }

interface Candidate {
  key: string;             // 일자+적요+금액 조합 — 중복 스킵/선택 상태 추적용
  transaction_date: string; // YYYY-MM-DD
  rawDesc: string;          // 적요(은행 원문)
  amount: number;
  category: string;         // 추정/선택된 카테고리
  description: string;      // manual_expenses에 저장할 내용
  matched: boolean;         // 반복설정 템플릿과 매칭되었는지(자동 체크 기준)
  duplicate: boolean;       // 이미 등록된 항목과 날짜+금액 일치(기본 미체크)
}

const CATEGORY_COLOR_KEYS = ['급여/상여', '세금/공과', '대출/수수료', '렌탈/위탁', '임대료/관리비', '기기구입/기타'];

// 괄호 안 내용·숫자 제거 후 2글자 n-gram 자카드 유사도로 대략적인 한글 텍스트 유사도 측정
// (완전 일치 문자열 매칭은 "세무법인건영" vs "세무기장료-건영"처럼 표기가 살짝 다른 경우를 못 잡아서)
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
  return inter / Math.min(A.size, B.size); // 짧은 쪽 기준 — 부분 포함도 높게 잡히도록
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
      const iDate = col('거래일시'), iDesc = col('적요'), iOut = col('출금');
      if (iDate === -1 || iDesc === -1 || iOut === -1) throw new Error('필수 컬럼(거래일시/적요/출금)을 찾지 못했습니다.');

      // 반복설정 템플릿 로드 — 매칭 기준
      const { data: templates } = await cardSupabase.from('recurring_settings').select('category, description');
      const tpls: RecurringTemplate[] = templates ?? [];

      // 기존 manual_expenses(최근 90일)와 대조해 중복(같은 날짜+금액) 여부 판단
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: existing } = await cardSupabase.from('manual_expenses').select('transaction_date, amount').gte('transaction_date', since);
      const existingKeys = new Set((existing ?? []).map((e: any) => `${e.transaction_date}_${Math.round(Number(e.amount))}`));

      const out: Candidate[] = [];
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const desc = String(row[iDesc] ?? '').trim();
        const amount = Number(row[iOut]);
        const date = excelDateToStr(row[iDate]);
        // 합계행/빈 출금/날짜 없는 행 제외
        if (!date || !desc || !amount || Number.isNaN(amount) || amount <= 0) continue;

        // 반복설정 템플릿과 최유사 매칭 (임계값 0.34 — "세무법인건영"↔"세무기장료-건영" 수준까지 커버)
        let best: RecurringTemplate | null = null, bestScore = 0;
        for (const t of tpls) {
          const s = similarity(desc, t.description);
          if (s > bestScore) { bestScore = s; best = t; }
        }
        const matched = bestScore >= 0.34;
        const dupKey = `${date}_${Math.round(amount)}`;
        out.push({
          key: `${date}_${desc}_${amount}_${r}`,
          transaction_date: date,
          rawDesc: desc,
          amount,
          category: matched && best ? best.category : (CATEGORY_COLOR_KEYS[0]),
          description: matched && best ? `${best.description}(${date.slice(5, 7)}월)` : desc,
          matched,
          duplicate: existingKeys.has(dupKey),
        });
      }

      if (out.length === 0) throw new Error('추출 가능한 출금 내역이 없습니다.');
      setCandidates(out);
      setSelected(new Set(out.filter((c) => c.matched && !c.duplicate).map((c) => c.key)));
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
        description: c.description || c.rawDesc, status: 'paid', // 이미 실제로 이체된 은행내역이므로 지급완료로 등록
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
            <p className="mb-2 text-xs text-slate-400">
              <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />반복설정 매칭됨(기본 선택)</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />최근 90일 내 동일 날짜·금액 항목 있음(중복 의심, 기본 미선택)</span>
            </p>
            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-slate-400">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 font-medium">일자</th>
                  <th className="px-2 py-2 font-medium">은행 적요</th>
                  <th className="px-2 py-2 font-medium">카테고리</th>
                  <th className="px-2 py-2 font-medium">내용</th>
                  <th className="px-2 py-2 text-right font-medium">금액</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {candidates.map((c) => (
                    <tr key={c.key} className={`${c.duplicate ? 'bg-amber-50/40' : c.matched ? 'bg-blue-50/30' : ''} hover:bg-slate-50`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} className="h-3.5 w-3.5" />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{c.transaction_date}</td>
                      <td className="px-2 py-1.5 text-slate-400">{c.rawDesc}</td>
                      <td className="px-2 py-1.5">
                        <select value={c.category} onChange={(e) => updateCandidate(c.key, { category: e.target.value })}
                          className="rounded border border-slate-200 px-1 py-0.5 text-xs outline-none">
                          {CATEGORY_COLOR_KEYS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={c.description} onChange={(e) => updateCandidate(c.key, { description: e.target.value })}
                          className="w-full min-w-[120px] rounded border border-slate-200 px-1.5 py-0.5 text-xs outline-none" />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right"><MoneyText value={c.amount} className="text-xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
