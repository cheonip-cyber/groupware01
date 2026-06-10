import React from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-1 py-2.5 border-b border-slate-50 last:border-0">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{children ?? '-'}</dd>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      <dl>{children}</dl>
    </div>
  );
}

export function ActionButton({ onClick, children, done, tone = 'blue' }:
  { onClick: () => void; children: React.ReactNode; done?: boolean; tone?: 'blue' | 'emerald' | 'slate' }) {
  if (done) return <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">✓ 완료됨</span>;
  const toneCls = {
    blue: 'bg-blue-600 hover:bg-blue-700', emerald: 'bg-emerald-600 hover:bg-emerald-700', slate: 'bg-slate-700 hover:bg-slate-800',
  }[tone];
  return <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${toneCls}`}>{children}</button>;
}

export function YesNo({ value }: { value?: boolean }) {
  return value
    ? <span className="text-emerald-600">완료</span>
    : <span className="text-slate-400">미완료</span>;
}
