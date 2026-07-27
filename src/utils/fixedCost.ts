// 고정비 항목의 표기·중복 판정 공용 규칙 (2026-07-27)
// 고정비 체크리스트와 판관비 자동등록이 같은 규칙을 쓰도록 한 곳에 모은다.
// 규칙 값은 DB(recurring_checklist_items)에 저장되며, 과거 이력 20건 중 17건과 일치함을 검증했다
// (불일치 3건은 '별도이체' 특수건, 오기 1건, 명칭 통일 대상 1건).

/** 대상 월 산정 기준 */
export type MonthBasis =
  | 'payment'   // 지급월(당월) — 급여·차량렌트·세무기장료·대출이자 등
  | 'previous'  // 항상 전월 — 사무실관리비(전월 요금을 당월 납부)
  | 'coverage'; // 월초(1~5일) 납부면 전월, 그 외 당월 — 4대보험·통신비

export interface FixedCostRule {
  label: string;
  month_basis: MonthBasis;
  month_suffix: string;   // '월' 또는 '월분'
  one_per_month: boolean; // 월 1건만 정상인 항목(중복 강화 판정 대상)
}

/** 'YYYY-MM-DD' 지급일 → 대상 연월 'YYYY-MM' */
export function targetMonth(date: string, basis: MonthBasis): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m) return '';
  const shift =
    basis === 'previous' ? -1 :
    basis === 'coverage' ? (d <= 5 ? -1 : 0) :
    0;
  const dt = new Date(y, m - 1 + shift, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/** 항목 표기 생성 — 예: 사무실관리비(6월분), 차량렌트-현대(7월) */
export function formatDescription(rule: FixedCostRule, date: string): string {
  const ym = targetMonth(date, rule.month_basis);
  const month = Number(ym.slice(5, 7));
  return `${rule.label}(${month}${rule.month_suffix})`;
}

/** 중복 판정 키 — 같은 항목의 같은 대상 월 (월 1건 항목에만 사용) */
export function itemMonthKey(itemId: number, date: string, basis: MonthBasis): string {
  return `${itemId}_${targetMonth(date, basis)}`;
}
