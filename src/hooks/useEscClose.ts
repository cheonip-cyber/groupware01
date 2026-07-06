import { useEffect } from 'react';

// 과거 그룹웨어 확정 요청: "모든 팝업창은 ESC 키로 닫을 수 있도록"
export function useEscClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}
