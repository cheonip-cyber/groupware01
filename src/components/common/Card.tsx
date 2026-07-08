import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card border border-slate-200 bg-white shadow-card ${className}`}>{children}</div>;
}

export function CardHeader({ title, action, icon }:
  { title: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-strong">{icon}{title}</h3>
      {action}
    </div>
  );
}
