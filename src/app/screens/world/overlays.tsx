// Areas on a map and outlines on the Diagram, chosen the same way in both (owner, 26 Nov: "outlines
// in diagrams is still not the same as areas for options to filter"):
//   - the filter menu: show them at all; a chip per set (groups, each tree); each set's rows as
//     checklists, folding, with Fold all / Open all;
//   - the side list (the key): the same sets and rows, each with a dot in its colour. Tap a row to
//     switch it on or off; double-tap to open its card; with a mouse, pointing picks it out.
import { useRef } from "react";
import { useFoldAll } from "./fold-all";
import { DOUBLE_TAP_MS } from "./gestures";

// A row: an area or outline (opens its item), or a link kind (opens the link kind).
export type OverlayRow = { id: string; name: string; key: string; opens: "place" | "link-kind"; depth: number; on: boolean; colour: string; line: "solid" | "dashed" | "dotted" };
export type OverlaySet = { id: string; title: string; on: boolean; rows: OverlayRow[] };

export function OverlayMenu({ label, master, onMaster, sets, onSet, onRow, onClose }: { label: string; master: boolean; onMaster: () => void; sets: OverlaySet[]; onSet: (id: string) => void; onRow: (row: OverlayRow) => void; onClose: () => void }) {
  const folds = useFoldAll();
  return (
    <>
      <div className="menu-catcher" onClick={onClose} />
      <div className="filter-panel areas-panel">
        <label className="choice"><input type="checkbox" checked={master} onChange={onMaster} /> <b>Show {label}</b></label>
        <div className="chips tree-chips">
          {sets.map((set) => (
            <button key={set.id} className={set.on ? "on" : ""} onClick={() => onSet(set.id)}>{set.title}</button>
          ))}
        </div>
        <div className="sub">{folds.controls}</div>
        {sets.filter((set) => set.rows.length > 0).map((set) => (
          <details key={`${set.id}|${folds.epoch}`} className="menu-section" open={folds.openFor(false)}>
            <summary className="sub menu-heading">{set.title} ({set.rows.filter((r) => r.on).length} of {set.rows.length})</summary>
            {set.rows.map((row) => (
              <label key={row.id} className="choice" style={{ paddingLeft: 8 + row.depth * 16, opacity: master && set.on ? 1 : 0.5 }}>
                <input type="checkbox" checked={row.on} onChange={() => onRow(row)} /> {row.name}
              </label>
            ))}
          </details>
        ))}
      </div>
    </>
  );
}

export function OverlayList({ heading, sets, picked, onRow, onHover, onOpen }: { heading: string; sets: OverlaySet[]; picked: string | null; onRow: (row: OverlayRow) => void; onHover: (id: string | null) => void; onOpen: (row: OverlayRow) => void }) {
  const folds = useFoldAll();
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  // One tap switches the row on or off; a second soon after switches it back and opens its card.
  const tap = (row: OverlayRow) => {
    const before = lastTap.current;
    if (before && before.id === row.id && Date.now() - before.time < DOUBLE_TAP_MS) {
      lastTap.current = null;
      onRow(row);
      return onOpen(row);
    }
    lastTap.current = { id: row.id, time: Date.now() };
    onRow(row);
  };
  const shown = sets.filter((set) => set.rows.length > 0);
  if (shown.length === 0) return null;
  return (
    <aside className="area-list">
      <div className="sub menu-heading">{heading} · tap: on/off · double-tap: open</div>
      <div className="sub">{folds.controls}</div>
      {shown.map((set) => (
        <details key={`${set.id}|${folds.epoch}`} open={folds.openFor(set.rows.some((r) => r.on))}>
          <summary className="sub menu-heading">{set.title} ({set.rows.filter((r) => r.on).length} of {set.rows.length})</summary>
          <ul className="plain">
            {set.rows.map((row) => (
              <li key={row.id}>
                <button
                  className={"area-row" + (picked === row.id ? " lit" : "") + (row.on ? " on" : "")}
                  onClick={() => tap(row)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && onHover(row.id)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
                >
                  <span className={`area-dot ${row.line}`} style={{ background: row.on ? row.colour : "transparent", borderColor: row.colour }} />
                  <span style={{ paddingLeft: row.depth * 10 }}>{row.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  );
}
