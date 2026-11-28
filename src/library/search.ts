// Searching everything on the device as you type (owner, 23 Nov): names, keys, aliases and types.
// Best first: a name that starts with what's typed, then a name containing it, then an alias, a type
// or the key. Pure.

import { isWorldItem } from "../world/world";
import type { Context, Item, Roster } from "../items/items";
import { viewRoster } from "../lists/roster";
import { gameUnits } from "../lists/game-view";

export type Found = { item: Item; how: "name" | "alias" | "type" | "key"; detail: string };

const KIND_WORDS: Record<string, string> = {
  unit: "unit", equipment: "equipment", "magic-item": "magic item", "special-rule": "rule", spell: "spell", lore: "lore", "race-profile": "race",
  "slot-kind": "command", "army-list": "army list", "composition-rule": "composition", package: "package", game: "game",
  source: "source", setting: "setting", patch: "patch", context: "set-up", roster: "list",
};

export function kindWord(item: Item): string {
  return KIND_WORDS[item.kind] ?? item.kind;
}

// The words an item can be found by besides its name: its aliases, and its types.
function aliasesOf(item: Item): string[] {
  if (item.kind === "equipment") return [...item.aliases, ...item.countsAs.map((t) => t.name)];
  if (item.kind === "magic-item") return item.countsAs.map((t) => t.name);
  if (item.kind === "slot-kind") return [item.code, ...item.aliases];
  return [];
}

function typesOf(item: Item): string[] {
  const out = [kindWord(item)];
  if (item.kind === "equipment" && item.type) out.push(item.type);
  if (item.kind === "magic-item") out.push(item.type, "magic item");
  if (item.kind === "special-rule" && item.ruleType) out.push(item.ruleType);
  if (item.kind === "spell" && item.spellType) out.push(item.spellType);
  if (item.kind === "source" && item.sourceKind) out.push(item.sourceKind);
  if (item.kind === "unit") out.push(item.class);
  return out;
}

export function search(items: Item[], text: string, most = 30): Found[] {
  const q = text.trim().toLowerCase();
  if (q.length === 0) return [];
  const ranked: { found: Found; rank: number }[] = [];
  for (const item of items) {
    if (item.kind === "sandbox" || isWorldItem(item)) continue; // worlds are searched in World
    const name = item.name.toLowerCase();
    const alias = aliasesOf(item).find((a) => a.toLowerCase().includes(q));
    const type = typesOf(item).find((t) => t.toLowerCase().includes(q));
    let found: { found: Found; rank: number } | null = null;
    if (name.startsWith(q)) found = { found: { item, how: "name", detail: "" }, rank: 0 };
    else if (name.includes(q)) found = { found: { item, how: "name", detail: "" }, rank: 1 };
    else if (alias) found = { found: { item, how: "alias", detail: `also ${alias}` }, rank: 2 };
    else if (type) found = { found: { item, how: "type", detail: type }, rank: 3 };
    else if (item.key.toLowerCase().includes(q)) found = { found: { item, how: "key", detail: item.key }, rank: 4 };
    if (found) ranked.push(found);
  }
  ranked.sort((a, b) => a.rank - b.rank || a.found.item.name.localeCompare(b.found.item.name));
  return ranked.slice(0, most).map((r) => r.found);
}

// --- Searching within a scope (owner, 24 Nov) ------------------------------------------------------
// Search opens on where you are: the whole library, one package, all your lists, one set-up, one list.
// Lists are searched by what you'd look for in them: list names, your names for units (Marcus
// Aurelius), the units' own names, their sections, the army list; set-ups by name.


export type Scope =
  | { kind: "library" }
  | { kind: "package"; key: string }
  | { kind: "game"; key: string } // a game's library: its short name
  | { kind: "lists" }
  | { kind: "context"; key: string }
  | { kind: "roster"; key: string };

// Where a hit opens: an item's card, a list, one unit in a list, a set-up.
export type Target = { kind: "item" | "roster" | "pickup" | "package" | "game"; key: string } | { kind: "roster-unit"; key: string; unit: string };
export type Hit = { label: string; detail: string; target: Target; stub?: boolean };

export function searchIn(items: Item[], text: string, scope: Scope, most = 40): Hit[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  // "horses" finds a horse: a trailing s is optional.
  const matches = (w: string | undefined) => !!w && (w.toLowerCase().includes(q) || (q.length > 3 && q.endsWith("s") && w.toLowerCase().includes(q.slice(0, -1))));
  const has = (...words: (string | undefined)[]) => words.some(matches);
  if (scope.kind === "library" || scope.kind === "package" || scope.kind === "game") {
    const pool =
      scope.kind === "package"
        ? items.filter((i) => i.homePackage === scope.key || i.key === scope.key)
        : items.filter((i) => i.kind !== "roster" && i.kind !== "context" && (scope.kind !== "game" || i.key === scope.key || i.key.startsWith(`${scope.key}.`)));
    return search(pool, text, most).map((f) => ({ label: f.item.name, detail: [kindWord(f.item), f.detail].filter(Boolean).join(" · "), target: targetOf(f.item), stub: f.item.status === "stub" }));
  }
  const rosters = items.filter((i): i is Roster => i.kind === "roster");
  const contexts = items.filter((i): i is Context => i.kind === "context");
  const inScope = scope.kind === "roster" ? rosters.filter((r) => r.key === scope.key) : scope.kind === "context" ? rosters.filter((r) => r.context === scope.key) : rosters;
  const hits: Hit[] = [];
  if (scope.kind === "lists") for (const c of contexts) if (has(c.name)) hits.push({ label: c.name, detail: "set-up", target: { kind: "pickup", key: c.key } });
  for (const r of inScope) {
    const view = viewRoster(r, items);
    if (scope.kind !== "roster" && has(r.name, view.armyList?.name)) hits.push({ label: r.name, detail: `list · ${view.armyList?.name ?? ""}`, target: { kind: "roster", key: r.key } });
    // A unit is found by anything about it: its names, section, kit, mount and the mount's kit, race, rules, items.
    for (const g of gameUnits(view, items)) {
      const found = [g.title, g.name, g.category, g.description, ...g.words].find(matches);
      if (!found) continue;
      const why = found !== g.title && found !== g.name && found !== g.category ? `has ${found}` : undefined;
      hits.push({ label: g.title ?? g.name, detail: [g.title ? g.name : undefined, g.category, why, scope.kind === "roster" ? undefined : r.name].filter(Boolean).join(" · "), target: { kind: "roster-unit", key: r.key, unit: g.id } });
    }
  }
  return hits.slice(0, most);
}

function targetOf(item: Item): Target {
  if (item.kind === "package") return { kind: "package", key: item.key };
  if (item.kind === "game") return { kind: "game", key: item.key };
  return { kind: "item", key: item.key };
}
