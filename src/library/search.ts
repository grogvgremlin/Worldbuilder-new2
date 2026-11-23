// Searching everything on the device as you type (owner, 23 Nov): names, keys, aliases and types.
// Best first: a name that starts with what's typed, then a name containing it, then an alias, a type
// or the key. Pure.

import type { Item } from "../items/items";

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
