import { createContext, useCallback, useContext, useState, type CSSProperties } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

// 전역 토스트: alert() 팝업을 대체하는 비차단 피드백 (성공/실패)
interface Toast { id: number; kind: 'success' | 'error'; message: string; }
interface ToastApi { success: (msg: string) => void; error: (msg: string) => void; }

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(ToastContext);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, kind, message }]);
    // 오류는 조금 더 오래 노출
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-card bg-ink-950 px-3.5 py-3 text-sm text-white shadow-pop">
            <span
              className={`mt-1.5 dot ${t.kind === 'success' ? 'dot-solid' : 'dot-alert'}`}
              style={{ '--dot-color': t.kind === 'success' ? '#34D399' : '#F87171' } as CSSProperties}
            />
            <span className="flex-1 break-all">{t.message}</span>
            <button onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))} className="text-white/50 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
