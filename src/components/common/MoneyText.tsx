import { formatCurrency, formatCompactKRW } from '../../utils/formatters';

export function MoneyText({ value, compact = false, suffix = '원', className = '' }:
  { value?: number; compact?: boolean; suffix?: string; className?: string }) {
  const text = compact ? formatCompactKRW(value) : formatCurrency(value);
  return <span className={`tabular-nums ${className}`}>{text}{value !== undefined && !compact ? suffix : ''}</span>;
}
