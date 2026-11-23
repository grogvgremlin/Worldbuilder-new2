// Every item of one kind in a game, across all its books, grouped by what the viewer picks:
// the book it lives in, the source it cites, its type, or whether it's entered yet.
// Data structure: rebuild/data-structure.md §9 (views on top of the stored items).
import { useState } from "react";
import type { ArmyList, Item } from "../../items/items";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { nameOf } from "./GameScreen";

export type BrowseKind = "special-rule" | "equipment" | "magic-item" | "unit" | "race-profile" | "source" | "patch";

export const BROWSE_KINDS: { kind: BrowseKind; title: string }[] = [
  { kind: "special-rule", title: "Rules" },
  { kind: "equipment", title: "Equipment" },
  { kind: "magic-item", title: "Magic items" },
  { kind: "unit", title: "Units" },
  { kind: "race-profile", title: "Races" },
  { kind: "source", title: "Bibliography" },
  { kind: "patch", title: "Patches" },
];

// Groups opened in Browse, kept while the app is open.
const openGroups = new Set<string>();

type GroupBy = "book" | "source" | "type" | "status";
const GROUPINGS: { by: GroupBy; title: string }[] = [
  { by: "book", title: "Book" },
  { by: "source", title: "Source cited" },
  { by: "type", title: "Type" },
  { by: "status", title: "Entered or not" },
];

export function BrowseScreen({ data, nav, game, kind }: { data: AppData; nav: Nav; game: string; kind: BrowseKind }) {
  const [by, setBy] = useState<GroupBy>("book");
  const [filter, setFilter] = useState("");
  const items = data.items.filter((i) => i.kind === kind && i.key.startsWith(game + ".")).filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const categoryOf = new Map(data.items.filter((i): i is ArmyList => i.kind === "army-list").flatMap((l) => l.entries.map((e) => [e.unit, e.category] as const)));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const label = groupLabel(item, by, data.items, categoryOf);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return (
    <section>
      <h1>{BROWSE_KINDS.find((k) => k.kind === kind)!.title}</h1>
      <div className="chips">
        <span className="sub">Group by</span>
        {GROUPINGS.map((g) => (
          <button key={g.by} className={by === g.by ? "on" : ""} onClick={() => setBy(g.by)}>{g.title}</button>
        ))}
      </div>
      <input className="filter" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => (
        // Each group folds; open ones stay open when you come back (owner, 23 Nov). A filter opens them all.
        <details
          key={`${label}|${filter !== ""}`}
          className="browse-group"
          open={filter !== "" || groups.size === 1 || openGroups.has(`${kind}|${by}|${label}`)}
          onToggle={(e) => {
            const id = `${kind}|${by}|${label}`;
            if ((e.target as HTMLDetailsElement).open) openGroups.add(id);
            else openGroups.delete(id);
          }}
        >
          <summary>
            <h2>{label} <span className="sub">{list.length}</span></h2>
          </summary>
          <ul className="plain">
            {list.sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
              <li key={i.key}>
                <button className={"link" + (i.status === "stub" ? " stub-link" : "")} onClick={() => nav.open({ name: "item", key: i.key })}>{i.name}</button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function groupLabel(item: Item, by: GroupBy, all: Item[], categoryOf: Map<string, string>): string {
  if (by === "book") return item.homePackage ? nameOf(item.homePackage, all) : "—";
  if (by === "source") return item.reference?.source ?? "No source given";
  if (by === "status") return item.status === "stub" ? "Not entered yet" : "Entered";
  if (item.kind === "special-rule") return item.ruleType ?? "No type given";
  if (item.kind === "equipment") return item.type ?? "No type given";
  if (item.kind === "magic-item") return item.type || "No type given";
  if (item.kind === "unit") return item.class === "mount" ? "Mount" : categoryOf.get(item.key) ?? "No category";
  if (item.kind === "race-profile") return item.race;
  if (item.kind === "source") return item.sourceKind ?? "No kind given";
  if (item.kind === "patch") return "Changes " + [...new Set(item.changes.map((c) => c.targetKind.replace("-", " ")))].join(", ");
  return "—";
}
