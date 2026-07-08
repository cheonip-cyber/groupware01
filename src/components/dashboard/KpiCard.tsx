import React from 'react';

export function KpiCard({ label, value, unit, hint, tone = 'default', icon, onClick }:
  { label: string; value: string | number; unit?: string; hint?: string;
    tone?: 'default' | 'blue' | 'amber' | 'emerald' | 'red'; icon?: React.ReactNode;
    onClick?: () => void }) {
  // 숫자는 원칙적으로 text-strong 유지(스캔 시 크기 인지 방해 방지). red만 문제 신호로 착색 허용.
  const toneMap = {
    default: 'text-text-strong', blue: 'text-text-strong',
    amber: 'text-text-strong', emerald: 'text-text-strong',
    red: 'text-st-danger',
  } as const;
  return (
    <div onClick={onClick}
      className={`rounded-card border border-slate-200 bg-white p-4 shadow-card transition hover:shadow-card-hover ${onClick ? 'cursor-pointer hover:border-brand-300' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-sub">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`kpi-value text-[28px] font-bold leading-none ${toneMap[tone]}`}>{value}</span>
        {unit && <span className="text-sm font-medium text-text-sub">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-text-sub">{hint}</div>}
    </div>
  );
}
