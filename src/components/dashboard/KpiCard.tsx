import React from 'react';

export function KpiCard({ label, value, unit, hint, tone = 'default', icon, onClick }:
  { label: string; value: string | number; unit?: string; hint?: string;
    tone?: 'default' | 'blue' | 'amber' | 'emerald' | 'red'; icon?: React.ReactNode;
    onClick?: () => void }) {
  const toneMap = {
    default: 'text-slate-900', blue: 'text-blue-600', amber: 'text-amber-600',
    emerald: 'text-emerald-600', red: 'text-red-600',
  } as const;
  return (
    <div onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${onClick ? 'cursor-pointer hover:border-blue-300' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${toneMap[tone]}`}>{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}
