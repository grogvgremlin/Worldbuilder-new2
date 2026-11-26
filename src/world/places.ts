// World items grouped by containment: an item's parent, its contents, its path, and the tree.
// Design: design/world-structure.md §3 (hierarchy is a kind of link with stricter rules: one parent
// at a time, no loops; "different views (geography, politics) are different link kinds"), §4
// (containment is a tree link kind), §11 (a loop is an error; the rest warns).
// A world can have several trees (owner, 25 Nov: by province, by terrain …): any link kind declared
// "one parent". The world names its main one (`tree`), used wherever no tree is chosen.
// Every function here takes the tree to follow as its last argument; left out, the main tree.

import type { Item, Link, LinkKind, Thing } from "../items/items";
import { linkKindsIn, linksIn, newLink, thingsIn, worldOf } from "./world";
import { fitsTree, inOrder, refusal } from "./kinds";

// The world's trees: its link kinds declared "one parent", in the world's order, else the main one first.
export function treeKinds(items: Item[], world: string): LinkKind[] {
  const w = worldOf(items, world);
  const trees = linkKindsIn(items, world).filter((k) => k.hierarchy === "one parent");
  if (w?.kindOrder?.length) return inOrder(items, world, trees); // the owner's order (World → Kinds)
  return trees.sort((a, b) => (a.key === w?.tree ? -1 : b.key === w?.tree ? 1 : a.name.localeCompare(b.name)));
}

function treeOrMain(items: Item[], world: string, tree?: string): string | undefined {
  return tree ?? worldOf(items, world)?.tree;
}

// The links of one tree.
function treeLinks(items: Item[], world: string, tree?: string): Link[] {
  const kind = treeOrMain(items, world, tree);
  if (!kind) return [];
  return linksIn(items, world).filter((l) => l.linkKind === kind);
}

// An item's parent, or null at the top. With more than one (from an upload), the first; see
// `treeWarnings`.
export function parentOf(items: Item[], world: string, thing: string, tree?: string): string | null {
  return treeLinks(items, world, tree).find((l) => l.from === thing)?.to ?? null;
}

export function childrenOf(items: Item[], world: string, thing: string, tree?: string): Thing[] {
  const keys = new Set(treeLinks(items, world, tree).filter((l) => l.to === thing).map((l) => l.from));
  return byName(thingsIn(items, world).filter((t) => keys.has(t.key)));
}

// Everything inside an item, at any depth.
export function descendantsOf(items: Item[], world: string, thing: string, tree?: string): Thing[] {
  const out: Thing[] = [];
  const seen = new Set([thing]);
  const walk = (key: string) => {
    for (const child of childrenOf(items, world, key, tree)) {
      if (seen.has(child.key)) continue; // a loop from an upload: don't walk forever
      seen.add(child.key);
      out.push(child);
      walk(child.key);
    }
  };
  walk(thing);
  return out;
}

// From the top down to the item itself: The Empire › Averland › Averheim.
export function pathOf(items: Item[], world: string, thing: string, tree?: string): Thing[] {
  const things = new Map(thingsIn(items, world).map((t) => [t.key, t]));
  const path: Thing[] = [];
  const seen = new Set<string>();
  let at: string | null = thing;
  while (at && !seen.has(at) && things.has(at)) {
    seen.add(at);
    path.unshift(things.get(at)!);
    at = parentOf(items, world, at, tree);
  }
  return path;
}

// The items with no parent in this tree: they sit straight in the world. Items that don't belong in
// the tree at all (a Person in "in terrain": its Expects) are left out.
export function topPlaces(items: Item[], world: string, tree?: string): Thing[] {
  const kind = treeOrMain(items, world, tree);
  const hasParent = new Set(treeLinks(items, world, tree).map((l) => l.from));
  return byName(thingsIn(items, world).filter((t) => !hasParent.has(t.key) && fitsTree(items, world, kind, t.key)));
}

// How deep an item sits: 0 at the top.
export function depthOf(items: Item[], world: string, thing: string, tree?: string): number {
  return pathOf(items, world, thing, tree).length - 1;
}

// A container holds something by a hierarchical link kind (any tree, or a group); a base item holds
// nothing. Worked out from the links, never stored (owner, 25 Nov: filter by containers / base items).
export function isContainer(items: Item[], world: string, thing: string): boolean {
  const hierarchical = new Set(linkKindsIn(items, world).filter((k) => k.hierarchy !== "none").map((k) => k.key));
  return linksIn(items, world).some((l) => l.to === thing && hierarchical.has(l.linkKind));
}

// Puts an item inside another (or at the top, with null), in one tree. Refused if it would make a
// loop: an item can't be inside itself or anything it holds.
export function setParent(items: Item[], world: string, thing: string, parent: string | null, tree?: string): { items: Item[]; problem?: string } {
  const kind = treeOrMain(items, world, tree);
  if (!kind) return { items, problem: "this world has no tree link kind (World → Kinds)" };
  if (parent === thing) return { items, problem: "an item can't be inside itself" };
  if (parent && descendantsOf(items, world, thing, kind).some((d) => d.key === parent)) return { items, problem: "that item is inside this one already" };
  const wrong = parent ? refusal(items, world, kind, "from", thing) ?? refusal(items, world, kind, "to", parent) : null;
  if (wrong) return { items, problem: wrong };
  const kept = items.filter((i) => !(i.kind === "link" && i.world === world && i.linkKind === kind && i.from === thing));
  if (!parent) return { items: kept };
  return { items: [...kept, newLink(kept, world, thing, kind, parent)] };
}

// What can't be walked or looks wrong in a tree (§11): two parents at once; a loop.
export function treeWarnings(items: Item[], world: string, tree?: string): string[] {
  const names = new Map(thingsIn(items, world).map((t) => [t.key, t.name]));
  const out: string[] = [];
  const parents = new Map<string, string[]>();
  for (const l of treeLinks(items, world, tree)) parents.set(l.from, [...(parents.get(l.from) ?? []), l.to]);
  for (const [child, ps] of parents) {
    if (ps.length > 1) out.push(`${names.get(child) ?? child} is in ${ps.map((p) => names.get(p) ?? p).join(" and ")} at once`);
  }
  for (const t of thingsIn(items, world)) {
    let at = parentOf(items, world, t.key, tree);
    const seen = new Set([t.key]);
    while (at) {
      if (seen.has(at)) {
        if (at === t.key) out.push(`${t.name} is inside itself (a loop)`);
        break;
      }
      seen.add(at);
      at = parentOf(items, world, at, tree);
    }
  }
  return out;
}

function byName(things: Thing[]): Thing[] {
  return [...things].sort((a, b) => a.name.localeCompare(b.name));
}

// Items in no tree and no group: neither inside anything nor holding anything, by any hierarchical
// link kind (owner, 26 Nov: "a list of items which are not under any tree … base items floating
// loose").
export function looseItems(items: Item[], world: string): Thing[] {
  const hierarchical = new Set(linkKindsIn(items, world).filter((k) => k.hierarchy !== "none").map((k) => k.key));
  const linked = new Set(linksIn(items, world).filter((l) => hierarchical.has(l.linkKind)).flatMap((l) => [l.from, l.to]));
  return byName(thingsIn(items, world).filter((t) => !linked.has(t.key)));
}
