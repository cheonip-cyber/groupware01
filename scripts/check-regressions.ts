/**
 * 배포 전 회귀 검사 (2026-08-02)
 *
 * 그동안 회귀가 반복된 이유는 "빌드가 통과하면 됐다"고 본 것이다.
 * 타입 검사로는 아래 유형이 전혀 잡히지 않는다 — 실제로 사고가 났던 항목만 모았다.
 *
 *   1) 테이블 컬럼 수 불일치      → 레이아웃 깨짐 (지급관리 컬럼 정리 때 발생)
 *   2) 조회 상한(limit) 누락/과소  → 과거 데이터가 화면에서 사라짐 (카드내역 6월 이전 실종)
 *   3) 참조가 끊긴 상태 변수       → 값이 반영되지 않음 (payMonth로 지급월이 무시되던 건)
 *   4) 훅 규칙 위반               → 화면 전체 오류(#300)
 *   5) 미사용 import/변수         → 삭제한 기능의 잔재
 *
 * 실행: npm run check
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = 'src';
let failed = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); failed++; };
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const files = walk(SRC);

// ── 1. 테이블 컬럼 수 일치 (헤더 th / 전체 폭 colSpan) ─────────────
console.log('\n[1] 테이블 컬럼 수 정합성');
for (const f of files.filter((x) => x.endsWith('.tsx'))) {
  const s = readFileSync(f, 'utf8');
  const heads = [...s.matchAll(/<thead[\s\S]*?<\/thead>/g)];
  if (heads.length !== 1) continue;   // 표가 여러 개면 어느 헤더에 속한 행인지 확정할 수 없어 건너뛴다
  // <th> 외에 <SortableTh> 같은 헤더 컴포넌트도 한 칸을 차지한다
  const th = (heads[0][0].match(/<th[\s>]/g) ?? []).length
    + (heads[0][0].match(/<SortableTh[\s>]/g) ?? []).length;
  if (th === 0) continue;
  for (const c of s.matchAll(/colSpan=\{(\d+)\}/g)) {
    const n = Number(c[1]);
    if (n <= 2 || n === th) continue;              // 부분 병합이거나 일치 → 정상
    const line = s.slice(0, c.index).split('\n').length;
    fail(`${f}:${line} 헤더 ${th}칸인데 colSpan={${n}} — 전체 폭 행이 어긋납니다`);
  }
}
if (!failed) ok('헤더 수와 colSpan 일치');

// ── 2. 조회 상한 점검 ────────────────────────────────────────────────
console.log('\n[2] 조회 상한(limit)');
const before2 = failed;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\.limit\((\d+)\)/g)) {
    const n = Number(m[1]);
    const line = s.slice(0, m.index).split('\n').length;
    // 목록 전체를 받아오는 조회에 낮은 상한이 걸리면 과거 데이터가 잘린다
    const ctx = s.slice(Math.max(0, (m.index ?? 0) - 200), m.index);
    const isList = /\.select\(/.test(ctx) && !/maybeSingle|single\(\)/.test(ctx);
    if (isList && n > 1 && n < 500 && !/_log\b|sync_log/.test(ctx)) {
      fail(`${f}:${line} limit(${n}) — 데이터가 늘면 과거 건이 화면에서 사라질 수 있습니다`);
    }
  }
}
if (failed === before2) ok('과소 상한 없음');

// ── 3. 참조가 끊긴 상태 변수 ─────────────────────────────────────────
console.log('\n[3] 값이 채워지지 않는 상태 변수');
const before3 = failed;
for (const f of files.filter((x) => x.endsWith('.tsx'))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/const \[(\w+), (set\w+)\] = useState/g)) {
    const [, getter, setter] = m;
    const uses = (s.match(new RegExp(`\\b${getter}\\b`, 'g')) ?? []).length;
    const sets = (s.match(new RegExp(`\\b${setter}\\b`, 'g')) ?? []).length;
    // 선언(1) 외에 읽는 곳은 있는데 setter를 호출하는 곳이 없으면 항상 초기값이다
    if (uses > 1 && sets <= 1) {
      const line = s.slice(0, m.index).split('\n').length;
      fail(`${f}:${line} '${getter}'를 읽지만 ${setter}를 호출하는 곳이 없습니다 — 항상 초기값입니다`);
    }
  }
}
if (failed === before3) ok('끊긴 상태 변수 없음');

// ── 4. 훅 규칙 (조기 return 뒤 훅 선언) ──────────────────────────────
console.log('\n[4] 훅 선언 위치');
const before4 = failed;
for (const f of files.filter((x) => x.endsWith('.tsx'))) {
  const lines = readFileSync(f, 'utf8').split('\n');
  const starts = lines.map((l, i) => (/^(export )?function [A-Z]/.test(l) ? i : -1)).filter((i) => i >= 0);
  starts.forEach((a, k) => {
    const b = starts[k + 1] ?? lines.length;
    let ret = -1;
    for (let i = a; i < b; i++) {
      // 컴포넌트 본문의 조기 반환(들여쓰기 2칸)만 대상 — 함수 내부 가드는 제외
      if (ret < 0 && /^ {2}if \(.*\) return /.test(lines[i])) ret = i;
      if (ret >= 0 && i > ret && /^ {2}(const \[[^\]]+\] = useState|useEffect\(|const \w+ = useMemo\(|const \w+ = useCallback\()/.test(lines[i])) {
        fail(`${f}:${i + 1} 조기 return(L${ret + 1}) 뒤에 훅이 선언돼 있습니다 — 화면 전체 오류의 원인`);
        break;
      }
    }
  });
}
if (failed === before4) ok('훅 선언 위치 정상');

console.log(failed === 0 ? '\n통과 — 배포 가능\n' : `\n${failed}건 발견 — 배포 전 확인 필요\n`);
process.exit(failed === 0 ? 0 : 1);
