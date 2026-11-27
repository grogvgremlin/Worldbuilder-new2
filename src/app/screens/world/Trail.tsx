// The World bar (owner, 26 Nov: "the navigation buttons disappear … and they jump around for diagram
// and map because of the screen widening: can they stay consistently placed, in a header as section
// links"): the world's sections (Items · Diagram · Maps · Kinds) and, below, every screen on the way
// here, each tappable (owner, 26 Nov: "show the tree you've come from"). Fixed under the header.
import type { Screen } from "../../App";
import type { AppData } from "../../app-data";
import { worldOf } from "../../../world/world";
import { recall, remember } from "./remembered";

export const WORLD_TABS = [
  { id: "items", label: "Items" },
  { id: "diagram", label: "Diagram" },
  { id: "maps", label: "Maps" },
  { id: "kinds", label: "Kinds" },
];

export function WorldBar({ data, stack, popTo }: { data: AppData; stack: Screen[]; popTo: (index: number) => void }) {
  const world = data.openWorld ?? "";
  const current = recall(`${world}|tab`, "items");
  const atRoot = stack.length < 2;
  const toTab = (tab: string) => {
    remember(`${world}|tab`, tab);
    popTo(0);
  };
  return (
    <nav className="world-bar">
      <span className="world-sections">
        {WORLD_TABS.map((t) => (
          <button key={t.id} className={atRoot && current === t.id ? "on" : ""} onClick={() => toTab(t.id)}>{t.label}</button>
        ))}
      </span>
      {!atRoot && (
        <span className="trail-steps">
          {stack.map((screen, n) => (
            <span key={n}>
              {n > 0 && <span className="trail-sep"> › </span>}
              {n < stack.length - 1 ? <button className="link" onClick={() => popTo(n)}>{labelOf(screen, data)}</button> : <b>{labelOf(screen, data)}</b>}
            </span>
          ))}
        </span>
      )}
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
    case "link": {
      const link = data.items.find((i) => i.key === screen.key);
      return link && link.kind === "link" ? `${nameOf(link.from)} – ${nameOf(link.to)}` : "Link";
    }
    default:
      return "…";
  }
}
