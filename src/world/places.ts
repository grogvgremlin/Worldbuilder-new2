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

// The world's trees: its link kinds declared "one parent", in the world's order (Kinds tab); with no
// order set yet, the starter's "in" first.
export function treeKinds(items: Item[], world: string): LinkKind[] {
  const w = worldOf(items, world);
  const trees = linkKindsIn(items, world).filter((k) => k.hierarchy === "one parent");
  if (w?.kindOrder?.length) return inOrder(items, world, trees); // the owner's order (World → Kinds)
  return trees.sort((a, b) => (a.key === w?.tree ? -1 : b.key === w?.tree ? 1 : a.name.localeCompare(b.name)));
}

// The first tree in the order: used wherever no tree is chosen (owner, 26 Nov: no "main", just priority).
export function firstTree(items: Item[], world: string): string | undefined {
  return treeKinds(items, world)[0]?.key;
}

function treeOrMain(items: Item[], world: string, tree?: string): string | undefined {
  return tree ?? firstTree(items, world);
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

// The items with no parent in this tree: they sit straight in the world. Left out: items that don't
// belong in the tree at all (a Person in "in terrain": what it takes), and loose items (nothing above,
// nothing inside) when the tree hides them, all or chosen ones (owner, 26 Nov).
export function topPlaces(items: Item[], world: string, tree?: string): Thing[] {
  const kind = treeOrMain(items, world, tree);
  const links = treeLinks(items, world, tree);
  const hasParent = new Set(links.map((l) => l.from));
  const holds = new Set(links.map((l) => l.to));
  const rule = linkKindsIn(items, world).find((k) => k.key === kind);
  const hidden = (t: Thing) => !holds.has(t.key) && (rule?.loose === "hide" || (rule?.hiddenHere ?? []).includes(t.key));
  return byName(thingsIn(items, world).filter((t) => !hasParent.has(t.key) && fitsTree(items, world, kind, t.key) && !hidden(t)));
}

// Items sitting loose in a tree (nothing above, nothing inside), hidden or not: for "show again".
export function looseIn(items: Item[], world: string, tree?: string): Thing[] {
  const links = treeLinks(items, world, tree);
  const linked = new Set(links.flatMap((l) => [l.from, l.to]));
  const kind = treeOrMain(items, world, tree);
  return byName(thingsIn(items, world).filter((t) => !linked.has(t.key) && fitsTree(items, world, kind, t.key)));
}

// Hides an item from a tree's view, or shows it again (only while it sits loose there).
export function hideHere(items: Item[], tree: string, thing: string, hide: boolean): Item[] {
  return items.map((i) => {
    if (i.kind !== "link-kind" || i.key !== tree) return i;
    const now = (i.hiddenHere ?? []).filter((k) => k !== thing);
    const next = hide ? [...now, thing] : now;
    return { ...i, hiddenHere: next.length ? next : undefined };
  });
}

// How deep an item sits: 0 at the top.
export function depthOf(items: Item[], world: string, thing: string, tree?: string): number {
  return pathOf(items, world, thing, tree).length - 1;
}

// A container holds something by a hierarchical link kind (any tree, or a group); a base item holds
// nothing. Worked out from the links, never stored (owner, 25 Nov: filter by containers / base items).
export function isContainer(items: Item[], world: string, thing: string): boolean {
  const hierarchical = new Set(linkKindsIn(items, world).filter((k) => k.hierarchy !== "none").map((k) => k.key));
  // An item made of links holds them (a link container, owner, 27 Nov), so it's a container too.
  return linksIn(items, world).some((l) => (l.to === thing && hierarchical.has(l.linkKind)) || l.partOf === thing);
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
  // An item hidden from this tree holds nothing in it (owner, 27 Nov: holding something showed it as
  // loose, and taking that out hid it again). Show it first.
  if (parent && hiddenByHand(items, kind, parent)) return { items, problem: `${thingsIn(items, world).find((t) => t.key === parent)?.name ?? parent} is hidden from this tree: show it first` };
  const kept = items.filter((i) => !(i.kind === "link" && i.world === world && i.linkKind === kind && i.from === thing));
  if (!parent) return { items: kept };
  // Put inside something, it's in the tree by choice: no longer hidden from it.
  return { items: [...hideHere(kept, kind, thing, false), newLink(kept, world, thing, kind, parent)] };
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

// Why an item doesn't show in a tree's view, or null if it does: hidden by hand ("hide here"), or
// loose while the tree hides loose items (owner, 26 Nov: "how do I add an item removed from a tree
// back").
// Whether an item is on the tree's "hidden here" list.
export function hiddenByHand(items: Item[], tree: string, thing: string): boolean {
  return items.some((i) => i.kind === "link-kind" && i.key === tree && (i.hiddenHere ?? []).includes(thing));
}

export function hiddenIn(items: Item[], world: string, tree: string, thing: string): "by hand" | "loose hidden" | null {
  const kind = linkKindsIn(items, world).find((k) => k.key === tree);
  const links = treeLinks(items, world, tree);
  const loose = !links.some((l) => l.from === thing || l.to === thing);
  if (!kind || !loose) return null;
  if ((kind.hiddenHere ?? []).includes(thing)) return "by hand";
  return kind.loose === "hide" ? "loose hidden" : null;
}
