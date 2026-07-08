import type { CSSProperties } from 'react';

// 저장 버튼 라벨 — 점 문법(설계안 §4.4)으로 "저장 중" 상태를 표시.
// 기존 텍스트만 있던 "저장 중…" 표기를 펄스 점 + 텍스트로 통일한다. 동작 로직은 변경하지 않는다.
export function SavingLabel({ saving, idle = '저장' }: { saving: boolean; idle?: string }) {
  if (!saving) return <>{idle}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="dot dot-pulse" style={{ '--dot-color': '#fff' } as CSSProperties} />
      저장 중
    </span>
  );
}
