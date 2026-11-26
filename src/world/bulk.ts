// Acting on several selected items at once (owner, 26 Nov: "selecting two or more means they can be
// grouped either to a new group or an existing one, including 'move into' as an option, where if
// an existing one is part of the selection then suggesting that first").
// Design: design/world-structure.md §3–4 (containment one parent at a time; groups many at once).

import type { Item, Thing } from "../items/items";
import { addToGroup, groupLinkKinds, groupsIn } from "./groups";
import { childrenOf, setParent } from "./places";
import { newKey, thingKindsIn, thingsIn } from "./world";
import { endRule } from "./kinds";

export type BulkResult = { items: Item[]; done: number; problems: string[] };

// Puts every selected item into a group (each one that can go; the rest say why).
export function groupSelected(items: Item[], world: string, selected: string[], group: string, linkKind?: string): BulkResult {
  const kind = linkKind ?? groupLinkKinds(items, world)[0]?.key;
  if (!kind) return { items, done: 0, problems: ["this world has no link kind for groups"] };
  let out = items;
  let done = 0;
  const problems: string[] = [];
  for (const key of selected.filter((k) => k !== group)) {
    const result = addToGroup(out, world, key, kind, group);
    if (result.problem) problems.push(`${nameOf(out, key)}: ${result.problem}`);
    else (out = result.items), done++;
  }
  return { items: out, done, problems };
}

// A new group holding the selected items.
export function newGroupOf(items: Item[], world: string, selected: string[], name: string, kind?: string): BulkResult & { group?: string } {
  if (!name.trim()) return { items, done: 0, problems: ["a group needs a name"] };
  const key = newKey(items, world, "thing", name);
  const chosen = kind ?? groupKindFor(items, world);
  const group: Thing = { key, kind: "thing", world, name: name.trim(), kinds: chosen ? [chosen] : [], fields: [] };
  return { ...groupSelected([...items, group], world, selected, key), group: key };
}

// The kind a new group starts as: the first kind its link kind takes as the container (so it can hold
// its members; owner, 26 Nov: a new group with no kind was refused by "in area takes Place"); else the
// world's only kind; else none.
export function groupKindFor(items: Item[], world: string, linkKind?: string): string | undefined {
  const kind = groupLinkKinds(items, world).find((k) => !linkKind || k.key === linkKind);
  const takes = kind ? endRule(kind, "to").take : [];
  if (takes.length) return takes[0];
  const kinds = thingKindsIn(items, world);
  return kinds.length === 1 ? kinds[0].key : undefined;
}

// Moves every selected item inside a container, in one tree (the main one unless given).
export function moveSelectedInto(items: Item[], world: string, selected: string[], container: string, tree?: string): BulkResult {
  let out = items;
  let done = 0;
  const problems: string[] = [];
  for (const key of selected.filter((k) => k !== container)) {
    const result = setParent(out, world, key, container, tree);
    if (result.problem) problems.push(`${nameOf(out, key)}: ${result.problem}`);
    else (out = result.items), done++;
  }
  return { items: out, done, problems };
}

// What to suggest first: selected items that are already groups, and selected items that already
// hold something in the tree (containers), so "put the others in it" is one tap.
export function suggestions(items: Item[], world: string, selected: string[], tree?: string): { groups: Thing[]; containers: Thing[] } {
  const chosen = thingsIn(items, world).filter((t) => selected.includes(t.key));
  const groups = new Set(groupsIn(items, world).map((g) => g.key));
  return {
    groups: chosen.filter((t) => groups.has(t.key)),
    containers: chosen.filter((t) => childrenOf(items, world, t.key, tree).length > 0),
  };
}

function nameOf(items: Item[], key: string): string {
  return items.find((i) => i.key === key)?.name ?? key;
}
