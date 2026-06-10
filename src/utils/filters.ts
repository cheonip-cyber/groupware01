import type { Project } from '../types';

export interface ProjectFilterState {
  search: string;
  status: string;        // '' = 전체
  clientId: string;
  manager: string;
  month: string;         // 'YYYY-MM' | ''
  priority: string;
  sort: 'startDate' | 'contractAmount' | 'updatedAt';
  sortDir: 'asc' | 'desc';
}

export const defaultFilterState: ProjectFilterState = {
  search: '', status: '', clientId: '', manager: '', month: '', priority: '',
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
