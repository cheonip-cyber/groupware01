import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

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
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm shadow-lg backdrop-blur ${
              t.kind === 'success' ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800' : 'border-red-200 bg-red-50/95 text-red-800'}`}>
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="flex-1 break-all">{t.message}</span>
            <button onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
