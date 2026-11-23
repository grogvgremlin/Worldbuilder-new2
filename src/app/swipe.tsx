// Swipes on the phone (with a mouse, a small cross on each removable row instead).
//   - From the left edge to the right: back one screen (an installed app has no browser back).
//   - A row to the left: shows its action ("Remove"); tap it to act, or swipe back to close.
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const EDGE = 28; // px from the left edge where a back swipe may start
const BACK_DISTANCE = 70;
const ROW_OPEN = 88; // px the row moves to show its action

export function useBackSwipe(onBack: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t.clientX <= EDGE ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      if (t.clientX - s.x > BACK_DISTANCE && Math.abs(t.clientY - s.y) < 60) onBack();
    },
  };
}

export function SwipeRow({ children, action, onAction }: { children: ReactNode; action: string; onAction: () => void }) {
  const [offset, setOffsetState] = useState(0);
  const current = useRef(0); // the latest offset, read when the finger lifts
  const setOffset = (x: number) => {
    current.current = x;
    setOffsetState(x);
  };
  const start = useRef<{ x: number; y: number; from: number } | null>(null);
  const horizontal = useRef(false);
  return (
    <div className="swipe-row">
      <button className="swipe-action" style={{ width: ROW_OPEN }} onClick={() => (setOffset(0), onAction())} tabIndex={offset ? 0 : -1}>
        {action}
      </button>
      <div
        className="swipe-body"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY, from: current.current };
          horizontal.current = false;
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const t = e.touches[0];
          const dx = t.clientX - s.x;
          if (!horizontal.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(t.clientY - s.y)) horizontal.current = true;
          if (horizontal.current) setOffset(Math.max(-ROW_OPEN - 20, Math.min(0, s.from + dx)));
        }}
        onTouchEnd={() => {
          if (horizontal.current) setOffset(current.current < -ROW_OPEN / 2 ? -ROW_OPEN : 0);
          start.current = null;
        }}
        onClickCapture={(e) => {
          // A tap on an open row closes it instead of opening the item.
          if (current.current !== 0) {
            e.stopPropagation();
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
      {/* With a mouse there's no swipe: a small cross does the same (shown by styles.css on mouse screens only). */}
      <button className="remove-cross" aria-label={action} title={action} onClick={() => onAction()}>×</button>
    </div>
  );
}
