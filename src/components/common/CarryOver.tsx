// 조회 연도 밖이지만 '미완료'라서 계속 노출되는 이월 건 표시 (2026-07-27)
// 연도로 걸러도 미정산·미수금·미지급 건은 남기는 정책이라, 왜 남아있는지 한눈에 보이도록 표기한다.
import { projectYear } from '../../utils/filters';
import type { Project } from '../../types';

export function CarryOverBadge({ project, year }: { project: Project; year: string }) {
  if (!year || year === '전체') return null;
  const y = projectYear(project);
  if (y === null || y === year) return null;
  return (
    <span
      title={`${y}년 건이지만 아직 완료되지 않아 계속 표시됩니다`}
      className="ml-1.5 inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 align-middle"
    >
      {y} 이월
    </span>
  );
}

/** 목록 상단 조회 기준 안내 */
export function ScopeNote({ year, openLabel }: { year: string; openLabel: string }) {
  return (
    <p className="border-b border-slate-100 px-5 py-2 text-[11px] text-slate-400">
      조회 연도: <b className="text-slate-600">{year === '전체' ? '전체 연도' : `${year}년`}</b> (헤더에서 변경)
      {year !== '전체' && <> · {openLabel} 건은 연도와 무관하게 계속 표시됩니다(<span className="text-amber-600">이월</span>)</>}
    </p>
  );
}
