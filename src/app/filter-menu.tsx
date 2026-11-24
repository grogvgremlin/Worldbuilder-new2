// A view menu behind one button (owner, 24 Nov: "a filter icon dropdown rather than the buttons").
// Ticks for things to show, or one choice of how to show them.
import { useState } from "react";

type Option = { id: string; label: string };

// Several on or off: "Points", "Stats" …
export function ShowMenu({ options, on, onToggle }: { options: Option[]; on: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="filter-menu">
      <button className="filter-button" aria-expanded={open} onClick={() => setOpen(!open)}>☰ Show ▾</button>
      {open && (
        <div className="filter-panel">
          {options.map((o) => (
            <label key={o.id} className="choice">
              <input type="checkbox" checked={on.has(o.id)} onChange={() => onToggle(o.id)} /> {o.label}
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
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value)?.label ?? "";
  return (
    <div className="filter-menu">
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
