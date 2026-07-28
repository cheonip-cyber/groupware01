import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';

// 전역 다이얼로그: 브라우저 기본 alert()/confirm()/prompt()를 대체한다. (2026-07-28)
// 기본 창은 브라우저마다 모양이 다르고 화면 상단에 붙어 눈에 잘 안 들어와,
// 앱과 같은 디자인으로 화면 정중앙에 표시한다.
// 기본 창과 달리 비동기이므로 호출부는 await 로 결과를 받는다.

type DialogKind = 'alert' | 'confirm' | 'prompt';
type Tone = 'info' | 'warning' | 'danger' | 'success';

interface DialogOptions {
  title?: string;
  /** 확인 버튼 문구 */
  confirmText?: string;
  /** 취소 버튼 문구 */
  cancelText?: string;
  tone?: Tone;
  /** prompt 전용 */
  defaultValue?: string;
  placeholder?: string;
  /** prompt 전용 — 비밀번호처럼 가려서 입력 */
  mask?: boolean;
}

interface DialogState extends DialogOptions {
  kind: DialogKind;
  message: string;
  resolve: (v: any) => void;
}

interface DialogApi {
  alert: (message: string, opts?: DialogOptions) => Promise<void>;
  confirm: (message: string, opts?: DialogOptions) => Promise<boolean>;
  prompt: (message: string, opts?: DialogOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi>({
  alert: async () => {}, confirm: async () => false, prompt: async () => null,
});
export const useDialog = () => useContext(DialogContext);

const TONE: Record<Tone, { icon: ReactNode; ring: string; btn: string }> = {
  info: { icon: <Info className="h-5 w-5 text-blue-500" />, ring: 'bg-blue-50', btn: 'bg-blue-600 hover:bg-blue-700' },
  success: { icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, ring: 'bg-emerald-50', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, ring: 'bg-amber-50', btn: 'bg-amber-600 hover:bg-amber-700' },
  danger: { icon: <AlertTriangle className="h-5 w-5 text-red-500" />, ring: 'bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((kind: DialogKind, message: string, opts?: DialogOptions) =>
    new Promise<any>((resolve) => {
      setValue(opts?.defaultValue ?? '');
      setState({ kind, message, resolve, ...opts });
    }), []);

  const api: DialogApi = {
    alert: (m, o) => open('alert', m, o),
    confirm: (m, o) => open('confirm', m, o),
    prompt: (m, o) => open('prompt', m, o),
  };

  const close = (result: any) => { state?.resolve(result); setState(null); };
  // 취소로 닫힐 때의 반환값: alert은 undefined, confirm은 false, prompt는 null
  const cancelValue = state?.kind === 'confirm' ? false : state?.kind === 'prompt' ? null : undefined;

  // 열릴 때 포커스: prompt는 입력칸, 그 외는 확인 버튼(엔터로 바로 확인 가능)
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      if (state.kind === 'prompt') inputRef.current?.focus();
      else confirmRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [state]);

  // ESC = 취소 (모든 팝업 ESC 닫기 규칙과 동일)
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(cancelValue); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state]);

  const tone = TONE[state?.tone ?? (state?.kind === 'confirm' ? 'warning' : 'info')];

  return (
    <DialogContext.Provider value={api}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={() => close(cancelValue)} />
          <div role="dialog" aria-modal="true"
            className="modal-pop relative w-full max-w-sm overflow-hidden rounded-card bg-white shadow-pop"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 pb-4 pt-5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.ring}`}>{tone.icon}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {state.title ?? (state.kind === 'confirm' ? '확인' : state.kind === 'prompt' ? '입력' : '알림')}
                </h3>
                {/* 줄바꿈(\n)을 그대로 살려 기존 메시지 형식을 유지한다 */}
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-600">{state.message}</p>
                {state.kind === 'prompt' && (
                  <input ref={inputRef} type={state.mask ? 'password' : 'text'} value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') close(value); }}
                    placeholder={state.placeholder}
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                )}
              </div>
              <button onClick={() => close(cancelValue)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
              {state.kind !== 'alert' && (
                <button onClick={() => close(cancelValue)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  {state.cancelText ?? '취소'}
                </button>
              )}
              <button ref={confirmRef}
                onClick={() => close(state.kind === 'confirm' ? true : state.kind === 'prompt' ? value : undefined)}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${tone.btn}`}>
                {state.confirmText ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
