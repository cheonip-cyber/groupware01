import type { Project, ProjectStatus, PaymentRequest } from '../types';

// ── 취소/보류 제외 강제 브랜드 타입 ──
// 문제: 대시보드/매출/예산/정산 등 집계 코드마다 각자 `.filter(p => p.projectStatus !== '취소/보류')`를
// 손으로 넣는 방식이라, 새 위젯을 추가할 때 빠뜨리면 병합됨(취소/보류) 프로젝트가 그대로 집계에 섞여
// 반복적으로 재발했다(대시보드 요약표, 이번달 자금 캘린더 등에서 실제 발생).
// 해결: activeProjects/activePayments를 거친 결과에만 존재하는 브랜드를 부여하고,
// 집계 함수들은 원본 Project[]/PaymentRequest[]가 아니라 이 브랜드 타입만 인자로 받도록 만든다.
// → 필터를 빼먹고 원본 배열을 바로 넘기면 타입 에러로 빌드가 실패한다(런타임까지 안 가고 즉시 발견).
declare const activeBrand: unique symbol;
export type ActiveProject = Project & { readonly [activeBrand]: true };
export type ActivePaymentRequest = PaymentRequest & { readonly [activeBrand]: true };

// 프로젝트 목록에서 취소/보류(병합됨 레거시 포함)를 제외한다.
// ⚠️ 프로젝트 목록 화면(ProjectListPage) 등 사용자가 취소/보류를 직접 보고 싶어할 수 있는 화면에는 쓰지 않는다 —
// 거기는 상태 태그 필터로 사용자가 직접 켜고 끈다. 이 함수는 대시보드·매출·예산·정산 등
// "취소된 건은 항상 제외되어야 하는" 집계/리포트 용도 전용이다.
export const activeProjects = (projects: Project[]): ActiveProject[] =>
  projects.filter((p) => p.projectStatus !== '취소/보류') as ActiveProject[];

// 지급 목록에서 취소/보류 프로젝트에 속한 항목을 제외한다 (PaymentRequest 자체엔 프로젝트 상태가 없어
// projects와 대조해서 걸러야 함 — 바로 이 대조를 빠뜨린 게 이번 자금 캘린더 버그의 원인이었다).
export const activePayments = (payments: PaymentRequest[], projects: Project[]): ActivePaymentRequest[] => {
  const cancelledIds = new Set(projects.filter((p) => p.projectStatus === '취소/보류').map((p) => p.id));
  return payments.filter((r) => !cancelledIds.has(r.projectId)) as ActivePaymentRequest[];
};

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
      if (f.year === '미지정') { if (y !== null) return false; }
      // 특정 연도를 선택해도 아직 매출월/교육일정이 없는(미지정) 신규 건은 계속 보여준다 —
      // 안 그러면 방금 노션에 등록한 신규 리드가 "동기화 안 됨"처럼 안 보이는 문제가 있었음
      else if (y !== null && y !== f.year) return false;
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
