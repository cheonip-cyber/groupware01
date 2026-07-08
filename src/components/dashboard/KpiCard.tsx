import React from 'react';

export function KpiCard({ label, value, unit, hint, tone = 'default', icon, onClick }:
  { label: string; value: string | number; unit?: string; hint?: string;
    tone?: 'default' | 'blue' | 'amber' | 'emerald' | 'red'; icon?: React.ReactNode;
    onClick?: () => void }) {
  // 숫자는 원칙적으로 text-strong 유지(스캔 시 크기 인지 방해 방지). red만 문제 신호로 착색 허용.
  const toneMap = {
    default: 'text-[--color-text-strong]', blue: 'text-[--color-text-strong]',
    amber: 'text-[--color-text-strong]', emerald: 'text-[--color-text-strong]',
    red: 'text-[--color-st-danger]',
  } as const;
  return (
    <div onClick={onClick}
      className={`rounded-[--radius-card] border border-slate-200 bg-white p-4 shadow-[--shadow-card] transition hover:shadow-[--shadow-card-hover] ${onClick ? 'cursor-pointer hover:border-brand-300' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[--color-text-sub]">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`kpi-value text-[28px] font-bold leading-none ${toneMap[tone]}`}>{value}</span>
        {unit && <span className="text-sm font-medium text-[--color-text-sub]">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-[--color-text-sub]">{hint}</div>}
    </div>
  );
}
