import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../store/appData';
import { Search } from 'lucide-react';

// 전역 통합 검색 (인텔리전스 1차): 프로젝트/강사/업체/고객사를 한 검색창에서 찾아 바로 점프
// — "어떤 데이터든 클릭하면 그 데이터로 연결"되는 연계성의 진입점
export function GlobalSearch() {
  const { projects, instructors, companies, clients } = useAppData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: { kind: string; label: string; sub: string; go: () => void }[] = [];
    for (const p of projects) {
      if (out.length >= 12) break;
      if (`${p.projectName} ${p.clientName ?? ''}`.toLowerCase().includes(query))
        out.push({ kind: '프로젝트', label: p.projectName, sub: `${p.clientName ?? ''} · ${p.projectStatus}`, go: () => navigate(`/projects/${p.id}`) });
    }
    for (const c of clients) {
      if (out.length >= 14) break;
      if (c.name.toLowerCase().includes(query))
        out.push({ kind: '고객사', label: c.name, sub: `프로젝트 ${projects.filter((p) => p.clientName === c.name).length}건`, go: () => navigate(`/projects?q=${encodeURIComponent(c.name)}`) });
    }
    for (const i of instructors) {
      if (out.length >= 17) break;
      if (`${i.name} ${i.specialty ?? ''}`.toLowerCase().includes(query))
        out.push({ kind: '강사', label: i.name, sub: i.specialty ?? '', go: () => navigate('/instructors') });
    }
    for (const c of companies) {
      if (out.length >= 20) break;
      if (`${c.companyName} ${c.ceoName ?? ''}`.toLowerCase().includes(query))
        out.push({ kind: '업체', label: c.companyName, sub: c.ceoName ? `대표 ${c.ceoName}` : '', go: () => navigate('/companies') });
    }
    return out;
  }, [q, projects, instructors, companies, clients, navigate]);

  const KIND_CLS: Record<string, string> = {
    '프로젝트': 'bg-blue-50 text-blue-600', '고객사': 'bg-emerald-50 text-emerald-600',
    '강사': 'bg-indigo-50 text-indigo-600', '업체': 'bg-violet-50 text-violet-600',
  };

  return (
    <div ref={boxRef} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-300" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="통합 검색 (프로젝트·고객사·강사·업체)"
        className="w-64 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition-all focus:w-80 focus:border-blue-400 focus:bg-white"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 z-50 mt-1 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">검색 결과 없음</p>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => { r.go(); setOpen(false); setQ(''); }}
              className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_CLS[r.kind]}`}>{r.kind}</span>
              <span className="flex-1 truncate font-medium text-slate-800">{r.label}</span>
              <span className="max-w-[40%] truncate text-xs text-slate-400">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
