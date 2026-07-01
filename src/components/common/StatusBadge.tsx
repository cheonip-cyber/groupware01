import type { BadgeStyle } from '../../utils/statusConfig';

const FALLBACK_STYLE: BadgeStyle = { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' };

export function StatusBadge({ label, style, size = 'md' }: { label: string; style?: BadgeStyle; size?: 'sm' | 'md' }) {
  const s = style ?? FALLBACK_STYLE;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.text} ${pad}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}
