import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 구 그룹웨어 방식 지급월 선택기: 달력 대신 세로 1열 1~12월 목록 (공간 적게 차지)
// value/onChange는 'YYYY-MM' 형식. year는 고정(옵션)하거나 현재 연도를 기본으로 사용.
// 드롭다운은 Portal로 document.body에 렌더링한다 — 표가 스크롤 박스(overflow-y-auto) 안에 있으면
// absolute 배치로는 z-index와 무관하게 스크롤 박스 경계에서 잘려 보이는 문제가 있었음.
export function MonthPicker({ value, onChange, year, className }: {
  value?: string; onChange: (ym: string) => void; year?: number; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const y = year ?? (value ? Number(value.slice(0, 4)) : new Date().getFullYear());
  const currentMonth = value ? Number(value.slice(5, 7)) : new Date().getMonth() + 1;

  const MENU_H = 224; // max-h-56
  const MENU_W = 64;  // w-16

  /** 버튼 기준 위치 계산 — 아래 공간이 모자라면 위로 띄우고, 좌우도 화면 안으로 보정한다.
   *  (표 하단 행에서 목록이 화면 밖으로 나가 선택할 수 없던 문제) */
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const top = below < MENU_H + 8 && r.top > MENU_H + 8
      ? r.top - MENU_H - 4                                  // 위로 펼치기
      : Math.min(r.bottom + 4, window.innerHeight - MENU_H - 8); // 아래 여백 안으로 보정
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
    setPos({ top: Math.max(8, top), left });
  };

  const openMenu = () => { place(); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // 스크롤·리사이즈 시 닫지 않고 위치를 다시 잡는다.
    // 예전에는 닫아버려서, 화면 밖으로 나간 목록을 보려고 스크롤하면 사라져 선택할 수 없었다.
    // 버튼 자체가 화면 밖으로 벗어난 경우에만 닫는다.
    const onScroll = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        className={className ?? 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300'}>
        {currentMonth}월
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}
          className="flex max-h-56 w-16 flex-col overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button key={m} type="button"
              onClick={() => { onChange(`${y}-${String(m).padStart(2, '0')}`); setOpen(false); }}
              className={`px-3 py-1.5 text-center text-xs hover:bg-blue-50 ${m === currentMonth ? 'bg-blue-50 font-bold text-blue-600' : 'text-slate-600'}`}>
              {m}월
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
