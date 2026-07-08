import type { CSSProperties } from 'react';
import type { BadgeStyle, DotKind } from '../../utils/statusConfig';

const FALLBACK_STYLE: BadgeStyle = { bg: 'bg-slate-100', text: 'text-slate-600', dot: '#64748B', dotKind: 'solid' };

// 점(Dot) 문법: solid=종결된 상태, pulse=진행 중(살아있음), ring=대기 중(사람 액션 필요), alert=문제 상태
const DOT_CLASS: Record<DotKind, string> = {
  solid: 'dot dot-solid',
  pulse: 'dot dot-pulse',
  ring: 'dot dot-ring',
  alert: 'dot dot-alert',
};

export function StatusBadge({ label, style, size = 'md' }: { label: string; style?: BadgeStyle; size?: 'sm' | 'md' }) {
  const s = style ?? FALLBACK_STYLE;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.text} ${pad}`}>
      <span className={DOT_CLASS[s.dotKind]} style={{ '--dot-color': s.dot } as CSSProperties} />
      {label}
    </span>
  );
}
