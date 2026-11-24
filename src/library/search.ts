// Searching everything on the device as you type (owner, 23 Nov): names, keys, aliases and types.
// Best first: a name that starts with what's typed, then a name containing it, then an alias, a type
// or the key. Pure.

import type { ArmyList, Context, Item, Roster, Unit } from "../items/items";

export type Found = { item: Item; how: "name" | "alias" | "type" | "key"; detail: string };

const KIND_WORDS: Record<string, string> = {
  unit: "unit", equipment: "equipment", "magic-item": "magic item", "special-rule": "rule", "race-profile": "race",
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
  if (item.kind === "source" && item.sourceKind) out.push(item.sourceKind);
  if (item.kind === "unit") out.push(item.class);
  return out;
}

export function search(items: Item[], text: string, most = 30): Found[] {
  const q = text.trim().toLowerCase();
  if (q.length === 0) return [];
  const ranked: { found: Found; rank: number }[] = [];
  for (const item of items) {
    if (item.kind === "sandbox") continue;
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
  | { kind: "lists" }
  | { kind: "context"; key: string }
  | { kind: "roster"; key: string };

// Where a hit opens: an item's card, a list, one unit in a list, a set-up.
export type Target = { kind: "item" | "roster" | "pickup" | "package" | "game"; key: string } | { kind: "roster-unit"; key: string; unit: string };
export type Hit = { label: string; detail: string; target: Target; stub?: boolean };

export function searchIn(items: Item[], text: string, scope: Scope, most = 40): Hit[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const has = (...words: (string | undefined)[]) => words.some((w) => w?.toLowerCase().includes(q));
  if (scope.kind === "library" || scope.kind === "package") {
    const pool = scope.kind === "package" ? items.filter((i) => i.homePackage === scope.key || i.key === scope.key) : items.filter((i) => i.kind !== "roster" && i.kind !== "context");
    return search(pool, text, most).map((f) => ({ label: f.item.name, detail: [kindWord(f.item), f.detail].filter(Boolean).join(" · "), target: targetOf(f.item), stub: f.item.status === "stub" }));
  }
  const rosters = items.filter((i): i is Roster => i.kind === "roster");
  const contexts = items.filter((i): i is Context => i.kind === "context");
  const inScope = scope.kind === "roster" ? rosters.filter((r) => r.key === scope.key) : scope.kind === "context" ? rosters.filter((r) => r.context === scope.key) : rosters;
  const hits: Hit[] = [];
  if (scope.kind === "lists") for (const c of contexts) if (has(c.name)) hits.push({ label: c.name, detail: "set-up", target: { kind: "pickup", key: c.key } });
  for (const r of inScope) {
    const list = items.find((i): i is ArmyList => i.kind === "army-list" && i.key === r.armyList);
    if (scope.kind !== "roster" && has(r.name, list?.name)) hits.push({ label: r.name, detail: `list · ${list?.name ?? ""}`, target: { kind: "roster", key: r.key } });
    for (const u of r.units) {
      const unit = items.find((i): i is Unit => i.kind === "unit" && i.key === u.unit);
      const section = list?.entries.find((e) => e.unit === u.unit)?.category;
      if (has(u.title, unit?.name, section, u.description))
        hits.push({ label: u.title ?? unit?.name ?? u.unit, detail: [u.title ? unit?.name : undefined, section, scope.kind === "roster" ? undefined : r.name].filter(Boolean).join(" · "), target: { kind: "roster-unit", key: r.key, unit: u.id } });
    }
  }
  return hits.slice(0, most);
}

function targetOf(item: Item): Target {
  if (item.kind === "package") return { kind: "package", key: item.key };
  if (item.kind === "game") return { kind: "game", key: item.key };
  return { kind: "item", key: item.key };
}
