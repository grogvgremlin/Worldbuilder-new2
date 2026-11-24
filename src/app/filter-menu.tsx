// A view menu behind one button (owner, 24 Nov: "a filter icon dropdown rather than the buttons").
// Ticks for things to show, or one choice of how to show them.
import { useEffect, useRef, useState } from "react";

// Open, and closed again by a tap anywhere outside it (owner, 24 Nov).
function useMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return { open, setOpen, box };
}

// `parent`: shown under another option, and only counts while that one is on (Battle → Battle notes).
type Option = { id: string; label: string; parent?: string };

// Several on or off: "Points", "Stats" …
export function ShowMenu({ options, on, onToggle }: { options: Option[]; on: Set<string>; onToggle: (id: string) => void }) {
  const { open, setOpen, box } = useMenu();
  return (
    <div className="filter-menu" ref={box}>
      <button className="filter-button" aria-expanded={open} onClick={() => setOpen(!open)}>☰ Show ▾</button>
      {open && (
        <div className="filter-panel">
          {options.map((o) => (
            <label key={o.id} className={"choice" + (o.parent ? " child" : "") + (o.parent && !on.has(o.parent) ? " unavailable" : "")}>
              <input type="checkbox" checked={on.has(o.id)} disabled={!!o.parent && !on.has(o.parent)} onChange={() => onToggle(o.id)} /> {o.label}
            </label>
          ))}
          <button className="link" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}

// One of several: "As the books nest", "All, by type" …
export function ViewMenu({ options, value, onChange }: { options: Option[]; value: string; onChange: (id: string) => void }) {
  const { open, setOpen, box } = useMenu();
  const current = options.find((o) => o.id === value)?.label ?? "";
  return (
    <div className="filter-menu" ref={box}>
      <button className="filter-button" aria-expanded={open} onClick={() => setOpen(!open)}>☰ {current} ▾</button>
      {open && (
        <div className="filter-panel">
          {options.map((o) => (
            <label key={o.id} className="choice">
              <input type="radio" checked={o.id === value} onChange={() => (onChange(o.id), setOpen(false))} /> {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
