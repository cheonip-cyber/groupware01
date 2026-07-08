import type { CSSProperties } from 'react';
import type { ProjectStatus } from '../../types';

// 프로젝트 상태 파이프라인 — 표시 전용, 클릭 동작 없음 (설계안 §4.5).
// 지난 단계=솔리드+실선, 현재 단계=펄스, 미래 단계=링+점선.
const STAGES: ProjectStatus[] = ['제안중', '제안완료', '확정/준비', '운영중', '보고/정산', '완료'];

export function StatusPipeline({ status }: { status: ProjectStatus }) {
  if (status === '취소/보류') {
    return (
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <span className="dot dot-solid" style={{ '--dot-color': '#64748B' } as CSSProperties} />
        취소/보류된 프로젝트 — 진행 파이프라인이 적용되지 않습니다
      </div>
    );
  }

  const currentIdx = STAGES.indexOf(status);

  return (
    <div className="flex items-center overflow-x-auto py-1">
      {STAGES.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        const dotClass = isPast ? 'dot-solid' : isCurrent ? 'dot-pulse' : 'dot-ring';
        const dotColor = isPast || isCurrent ? '#059669' : '#64748B';
        return (
          <div key={s} className="flex shrink-0 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span className={`dot ${dotClass}`} style={{ '--dot-color': isCurrent ? '#7C3AED' : dotColor } as CSSProperties} />
              <span className={`whitespace-nowrap text-[11px] ${isCurrent ? 'font-semibold text-text-strong' : 'text-text-sub'}`}>{s}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`mx-1.5 mb-4 h-px w-8 ${isPast ? 'bg-emerald-400' : 'border-t border-dashed border-slate-300 bg-transparent'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
