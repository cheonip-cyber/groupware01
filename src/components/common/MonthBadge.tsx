// 매출월 박스 표기 — 목록에서 숫자가 눈에 잘 띄도록 작은 뱃지로 표시 (2026-07-09)
export function MonthBadge({ yearMonth }: { yearMonth?: string }) {
  const m = yearMonth?.match(/^\d{4}-(\d{2})/);
  if (!m) return <span className="text-xs text-slate-300">-</span>;
  return (
    <span className="inline-flex items-center justify-center gap-0.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold tabular-nums text-brand-700">
      {Number(m[1])}<span className="font-normal text-brand-400">월</span>
    </span>
  );
}
