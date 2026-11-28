// The Diagram's Out of scope panel (owner, 28 Nov): what the tree or network shown would take but
// isn't in it, at the side, ready to be brought in.
//   - grouped by kind, flavours under their kind, each group folding (Fold all / Open all);
//   - tap to select (several at once), double-tap to open the item;
//   - drag a row by its handle (and everything selected with it) onto the diagram: on a box, inside it (a tree) or
//     connected to it (a network); elsewhere, in scope at the top (a tree) or into the workspace (a
//     network). A box dragged onto this panel goes out of scope;
//   - or select and tap Bring in, which puts them at the top (a tree) or in the workspace (a network).
// Design: design/world-structure.md §3, §5 (views on the same structure). Core: places.ts (a tree's
// scope), network.ts (a network's).
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Thing } from "../../../items/items";
import { kindTree } from "../../../world/kinds";
import { iconOf } from "../../../world/maps";
import type { AppData } from "../../app-data";
import { useFoldAll } from "./fold-all";
import { DOUBLE_TAP_MS } from "./gestures";

export function ScopePanel({ data, world, things, network, selected, onSelect, onOpen, onBringIn, onCarry }: {
  data: AppData;
  world: string;
  things: Thing[];
  network: boolean;
  selected: string[];
  onSelect: (keys: string[]) => void;
  onOpen: (key: string) => void;
  onBringIn: (keys: string[]) => void;
  onCarry: (keys: string[], e: ReactPointerEvent) => void; // a drag begins
}) {
  const folds = useFoldAll();
  const lastTap = useRef<{ key: string; time: number } | null>(null);
  // Each item under its first kind; kinds in the world's order, flavours after their kind.
  const groups = kindTree(data.items, world)
    .map(({ kind, depth }) => ({ id: kind.key, title: `${kind.icon ?? ""} ${kind.name}`, depth, list: things.filter((t) => t.kinds[0] === kind.key) }))
    .concat([{ id: "none", title: "No kind", depth: 0, list: things.filter((t) => t.kinds.length === 0) }])
    .filter((g) => g.list.length > 0);
  const tap = (key: string) => {
    const before = lastTap.current;
    if (before && before.key === key && Date.now() - before.time < DOUBLE_TAP_MS) {
      lastTap.current = null;
      return onOpen(key);
    }
    lastTap.current = { key, time: Date.now() };
    onSelect(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const chosen = selected.filter((k) => things.some((t) => t.key === k));
  return (
    <aside className="area-list scope-panel">
      <div className="sub menu-heading">Out of scope ({things.length}) · drag onto the diagram, or select and Bring in</div>
      <div className="sub">{folds.controls}</div>
      {chosen.length > 0 && (
        <div className="buttons">
          <button className="primary" onClick={() => onBringIn(chosen)}>Bring {chosen.length} in{network ? " (workspace)" : " (at the top)"}</button>
          <button onClick={() => onSelect([])}>Clear</button>
        </div>
      )}
      {things.length === 0 && <p className="sub">Nothing: everything it would take is in scope. Drag a box here to take it out.</p>}
      {groups.map((g) => (
        <details key={`${g.id}|${folds.epoch}`} open={folds.openFor(true)} style={{ marginLeft: g.depth * 10 }}>
          <summary className="sub menu-heading">{g.title} ({g.list.length})</summary>
          <ul className="plain">
            {g.list.map((t) => (
              <li key={t.key}>
                <div className="scope-line">
                  <button className={"area-row scope-row" + (selected.includes(t.key) ? " on" : "")} onClick={() => tap(t.key)}>
                    {iconOf(data.items, t)} {t.name}
                  </button>
                  {/* A handle to drag by, so the list still scrolls on a phone. */}
                  <span className="drag-handle" aria-label="Drag onto the diagram" onPointerDown={(e) => onCarry(selected.includes(t.key) ? chosen : [t.key], e)}>⠿</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  );
}
