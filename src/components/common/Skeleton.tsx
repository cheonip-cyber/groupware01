// 로딩 스켈레톤: "불러오는 중…" 텍스트 대체 — 화면 구조를 미리 보여줘 로딩 체감 개선
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-label="불러오는 중">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-4">
        <div className="mb-4 h-5 w-40 rounded bg-slate-100" />
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-slate-50" style={{ width: `${100 - (i % 3) * 6}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
