// 통화/날짜 포맷 유틸
export const formatCurrency = (value?: number): string => {
  if (value === undefined || value === null || isNaN(value)) return '-';
  return Math.round(value).toLocaleString('ko-KR');
};

// 억/만 단위 축약 (KPI 카드용): 180000000 -> "1.8억"
export const formatCompactKRW = (value?: number): string => {
  if (value === undefined || value === null || isNaN(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (abs >= 10000) return `${Math.round(value / 10000).toLocaleString('ko-KR')}만`;
  return value.toLocaleString('ko-KR');
};

export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDateRange = (start?: string, end?: string): string => {
  if (!start) return '-';
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} ~ ${formatDate(end)}`;
};

export const formatPercent = (rate?: number): string => {
  if (rate === undefined || rate === null || isNaN(rate)) return '-';
  return `${rate.toFixed(1)}%`;
};

export const daysUntil = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

// 이익률 표기: 매출 0원에 손실이 있으면 비율 산정이 불가하므로 '매출입력'으로 안내
export const profitRateLabel = (p: { contractAmount?: number; expectedProfit?: number; profitRate?: number }): string =>
  (p.contractAmount ?? 0) === 0 && (p.expectedProfit ?? 0) < 0 ? '매출입력' : `${p.profitRate ?? 0}%`;
