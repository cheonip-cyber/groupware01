import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// 제목줄 클릭 정렬 공용 UI (2026-07-09 전 대시보드 통일 지침).
// 아이콘은 평소 흐릿하게, 현재 정렬 컬럼만 방향 아이콘으로 강조 — 첨부 이미지4 스타일(최소 아이콘).
export function SortableTh<K extends string>({ label, sortKey, active, dir, onSort, className = '', align }:
  { label: string; sortKey: K; active: boolean; dir: 'asc' | 'desc'; onSort: (key: K) => void; className?: string; align?: 'right' }) {
  return (
    <th className={`${align === 'right' ? 'text-right' : 'text-left'} px-3 py-3 font-medium ${className}`}>
      <button onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-slate-700' : ''}`}>
        {label}
        {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );
}

// 테이블 1개당 독립적으로 쓰는 클라이언트 사이드 정렬 훅.
// getValue(row, key)가 비교 가능한 값(string|number)을 돌려주면 오름/내림차순 정렬한다.
export function useSortableRows<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => string | number | null | undefined,
  initial?: { key: K; dir: 'asc' | 'desc' },
) {
  const [sortKey, setSortKey] = useState<K | null>(initial?.key ?? null);
  const [dir, setDir] = useState<'asc' | 'desc'>(initial?.dir ?? 'asc');

  const onSort = (key: K) => {
    if (sortKey === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir('asc'); }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const withVal = rows.map((r) => ({ r, v: getValue(r, sortKey) }));
    withVal.sort((a, b) => {
      const av = a.v, bv = b.v;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ko');
      return dir === 'asc' ? cmp : -cmp;
    });
    return withVal.map((x) => x.r);
  }, [rows, sortKey, dir, getValue]);

  return { sorted, sortKey, dir, onSort };
}
