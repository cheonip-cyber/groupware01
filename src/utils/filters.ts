import type { Project, ProjectStatus } from '../types';

export interface ProjectFilterState {
  search: string;
  statuses: string[];    // 상태 태그 ON/OFF 다중 선택 — 배열에 포함된 상태만 노출(전부 ON이 기본, 취소/보류만 기본 OFF)
  clientId: string;
  manager: string;
  year: string;          // 'YYYY' | '전체' | '미지정' — 매출월(없으면 교육일) 기준
  month: string;         // '01'~'12' | '' — 매출월(없으면 교육일) 기준 월만 독립 필터 (연도와 별개)
  priority: string;
  sort: 'startDate' | 'contractAmount' | 'updatedAt' | 'revenueMonth' | 'profitRate' | 'managerName';
  sortDir: 'asc' | 'desc';
}

// 상태 태그 필터 옵션 — 단일 소스 (버튼 렌더링·기본값 계산 공용)
// '제안완료'는 DB 상태 파생 로직상 나올 수 없는 값이라 제외 (죽은 옵션 정리)
export const STATUSES: ProjectStatus[] = ['제안중', '확정/준비', '운영중', '보고/정산', '완료', '취소/보류'];

// 프로젝트 귀속 연도: 매출월(YYYY-MM) 우선, 없으면 교육일자 기준. 둘 다 없으면 null(미지정)
export const projectYear = (p: Project): string | null => {
  const src = p.revenueMonth || p.startDate;
  return src && /^\d{4}/.test(src) ? src.slice(0, 4) : null;
};

// 기본 필터: 올해 기준 (과거 수백 건이 매번 쏟아지는 문제 방지)
// 상태 태그: 전부 기본 ON, '취소/보류'만 기본 OFF (2026-07-08 요청 반영)
export const defaultFilterState: ProjectFilterState = {
  search: '', statuses: STATUSES.filter((s) => s !== '취소/보류'), clientId: '', manager: '',
  year: String(new Date().getFullYear()), month: '', priority: '',
  sort: 'startDate', sortDir: 'desc',
};

export const applyProjectFilters = (projects: Project[], f: ProjectFilterState): Project[] => {
  let out = projects.filter((p) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${p.projectName} ${p.clientName} ${p.courseName} ${p.managerName} ${p.topic}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!f.statuses.includes(p.projectStatus)) return false;
    if (f.clientId && p.clientId !== f.clientId) return false;
    if (f.manager && p.managerName !== f.manager) return false;
    if (f.priority && p.priority !== f.priority) return false;
    if (f.year && f.year !== '전체') {
      const y = projectYear(p);
      if (f.year === '미지정' ? y !== null : y !== f.year) return false;
    }
    if (f.month) {
      const src = p.revenueMonth || p.startDate;
      const mm = src && /^\d{4}-(\d{2})/.test(src) ? src.slice(5, 7) : null;
      if (mm !== f.month) return false;
    }
    return true;
  });

  out = [...out].sort((a, b) => {
    let av: number | string = '';
    let bv: number | string = '';
    if (f.sort === 'contractAmount') { av = a.contractAmount; bv = b.contractAmount; }
    else if (f.sort === 'updatedAt') { av = a.updatedAt; bv = b.updatedAt; }
    else if (f.sort === 'revenueMonth') { av = a.revenueMonth ?? ''; bv = b.revenueMonth ?? ''; }
    else if (f.sort === 'profitRate') { av = a.profitRate ?? -Infinity; bv = b.profitRate ?? -Infinity; }
    else if (f.sort === 'managerName') { av = a.managerName ?? ''; bv = b.managerName ?? ''; }
    else { av = a.startDate; bv = b.startDate; }
    if (av < bv) return f.sortDir === 'asc' ? -1 : 1;
    if (av > bv) return f.sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return out;
};
