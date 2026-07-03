import type { Project } from '../types';

export interface ProjectFilterState {
  search: string;
  status: string;        // '' = 전체
  clientId: string;
  manager: string;
  year: string;          // 'YYYY' | '전체' | '미지정' — 매출월(없으면 교육일) 기준
  month: string;         // 'YYYY-MM' | ''
  priority: string;
  sort: 'startDate' | 'contractAmount' | 'updatedAt';
  sortDir: 'asc' | 'desc';
}

// 프로젝트 귀속 연도: 매출월(YYYY-MM) 우선, 없으면 교육일자 기준. 둘 다 없으면 null(미지정)
export const projectYear = (p: Project): string | null => {
  const src = p.revenueMonth || p.startDate;
  return src && /^\d{4}/.test(src) ? src.slice(0, 4) : null;
};

// 기본 필터: 올해 기준 (과거 수백 건이 매번 쏟아지는 문제 방지)
export const defaultFilterState: ProjectFilterState = {
  search: '', status: '', clientId: '', manager: '',
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
    if (f.status && p.projectStatus !== f.status) return false;
    if (f.clientId && p.clientId !== f.clientId) return false;
    if (f.manager && p.managerName !== f.manager) return false;
    if (f.priority && p.priority !== f.priority) return false;
    if (f.year && f.year !== '전체') {
      const y = projectYear(p);
      if (f.year === '미지정' ? y !== null : y !== f.year) return false;
    }
    if (f.month && !(p.startDate || '').startsWith(f.month)) return false;
    return true;
  });

  out = [...out].sort((a, b) => {
    let av: number | string = '';
    let bv: number | string = '';
    if (f.sort === 'contractAmount') { av = a.contractAmount; bv = b.contractAmount; }
    else if (f.sort === 'updatedAt') { av = a.updatedAt; bv = b.updatedAt; }
    else { av = a.startDate; bv = b.startDate; }
    if (av < bv) return f.sortDir === 'asc' ? -1 : 1;
    if (av > bv) return f.sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return out;
};
