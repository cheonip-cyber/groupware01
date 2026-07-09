// 월 단위 검색 공용 UI — 브라우저 네이티브 달력 위젯(input type="month") 대신
// 연도/월을 각각 독립된 드롭다운으로 표기한다 (2026-07-09 통일 지침).
// value/onChange는 기존 코드와의 호환을 위해 'YYYY-MM' 문자열(빈 값 = 전체)을 그대로 사용한다.
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

export function YearMonthPicker({ value, onChange, yearsBack = 3, yearsForward = 1, className }:
  { value: string; onChange: (v: string) => void; yearsBack?: number; yearsForward?: number; className?: string }) {
  const now = new Date();
  const curY = now.getFullYear();
  const years = Array.from({ length: yearsBack + yearsForward + 1 }, (_, i) => String(curY + yearsForward - i));
  const [y, m] = value ? value.split('-') : ['', ''];
  const selCls = className ?? 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400';

  const setYear = (ny: string) => onChange(ny && m ? `${ny}-${m}` : ny ? `${ny}-${String(curY === Number(ny) ? now.getMonth() + 1 : 1).padStart(2, '0')}` : '');
  const setMonth = (nm: string) => onChange(nm ? `${y || String(curY)}-${nm}` : '');

  return (
    <span className="flex items-center gap-1.5">
      <select value={y} onChange={(e) => setYear(e.target.value)} className={selCls}>
        <option value="">연도</option>
        {years.map((yy) => <option key={yy} value={yy}>{yy}년</option>)}
      </select>
      <select value={m} onChange={(e) => setMonth(e.target.value)} className={selCls}>
        <option value="">전체 월</option>
        {MONTHS.map((mm) => <option key={mm} value={mm}>{Number(mm)}월</option>)}
      </select>
    </span>
  );
}
