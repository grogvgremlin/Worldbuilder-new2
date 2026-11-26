// The trail on the World tab (owner, 26 Nov: "show the tree you've come from so you can skip to a
// level or straight back to items or diagrams or maps"): every screen on the way here, each
// tappable, and the world's own tabs to jump straight to.
import type { Screen } from "../../App";
import type { AppData } from "../../app-data";
import { worldOf } from "../../../world/world";
import { remember } from "./remembered";

const WORLD_TABS = [
  { id: "items", label: "Items" },
  { id: "diagram", label: "Diagram" },
  { id: "maps", label: "Maps" },
];

export function Trail({ data, stack, popTo }: { data: AppData; stack: Screen[]; popTo: (index: number) => void }) {
  if (stack.length < 2) return null;
  const world = data.openWorld ?? "";
  const toTab = (tab: string) => {
    remember(`${world}|tab`, tab);
    popTo(0);
  };
  return (
    <nav className="trail">
      <span className="trail-tabs">
        {WORLD_TABS.map((t) => (
          <button key={t.id} className="link" onClick={() => toTab(t.id)}>{t.label}</button>
        ))}
      </span>
      <span className="trail-steps">
        {stack.map((screen, n) => (
          <span key={n}>
            {n > 0 && <span className="trail-sep"> › </span>}
            {n < stack.length - 1 ? <button className="link" onClick={() => popTo(n)}>{labelOf(screen, data)}</button> : <b>{labelOf(screen, data)}</b>}
          </span>
        ))}
      </span>
    </nav>
  );
}

function labelOf(screen: Screen, data: AppData): string {
  const nameOf = (key: string) => data.items.find((i) => i.key === key)?.name ?? "…";
  switch (screen.name) {
    case "world-root":
      return worldOf(data.items, data.openWorld ?? "")?.name ?? "Worlds";
    case "worlds":
      return "Worlds";
    case "place":
    case "map":
    case "thing-kind":
    case "link-kind":
      return nameOf(screen.key);
    default:
      return "…";
  }
}
