import { useEffect, useRef, useState } from 'react';

// 구 그룹웨어 방식 지급월 선택기: 달력 대신 세로 1열 1~12월 목록 (공간 적게 차지)
// value/onChange는 'YYYY-MM' 형식. year는 고정(옵션)하거나 현재 연도를 기본으로 사용.
export function MonthPicker({ value, onChange, year, className }: {
  value?: string; onChange: (ym: string) => void; year?: number; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const y = year ?? (value ? Number(value.slice(0, 4)) : new Date().getFullYear());
  const currentMonth = value ? Number(value.slice(5, 7)) : new Date().getMonth() + 1;

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative inline-block">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={className ?? 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300'}>
        {currentMonth}월
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex max-h-56 w-16 flex-col overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button key={m} type="button"
              onClick={() => { onChange(`${y}-${String(m).padStart(2, '0')}`); setOpen(false); }}
              className={`px-3 py-1.5 text-center text-xs hover:bg-blue-50 ${m === currentMonth ? 'bg-blue-50 font-bold text-blue-600' : 'text-slate-600'}`}>
              {m}월
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
