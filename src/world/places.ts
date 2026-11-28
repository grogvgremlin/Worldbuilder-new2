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

// --- Scope (owner, 28 Nov: "loose" is now "out of scope") -----------------------------------------
// An item is in a tree's scope when it's in the tree (inside something, or holding something), or
// brought in at the top though it holds nothing yet (kept on the tree: `inScope`). Everything else
// the tree would take is out of scope: offered at the side of the Diagram, to be brought in.

function scopeList(items: Item[], tree: string | undefined): string[] {
  return (items.find((i): i is LinkKind => i.kind === "link-kind" && i.key === tree)?.inScope ?? []);
}

export function isInScope(items: Item[], world: string, thing: string, tree?: string): boolean {
  const kind = treeOrMain(items, world, tree);
  return treeLinks(items, world, kind).some((l) => l.from === thing || l.to === thing) || scopeList(items, kind).includes(thing);
}

// The items at the top of the tree: in scope, with nothing above them.
export function topPlaces(items: Item[], world: string, tree?: string): Thing[] {
  const kind = treeOrMain(items, world, tree);
  const links = treeLinks(items, world, kind);
  const hasParent = new Set(links.map((l) => l.from));
  const holds = new Set(links.map((l) => l.to));
  const top = new Set(scopeList(items, kind));
  return byName(thingsIn(items, world).filter((t) => !hasParent.has(t.key) && (holds.has(t.key) || top.has(t.key)) && fitsTree(items, world, kind, t.key)));
}

// What the tree would take but isn't in its scope.
export function outOfScope(items: Item[], world: string, tree?: string): Thing[] {
  const kind = treeOrMain(items, world, tree);
  return byName(thingsIn(items, world).filter((t) => fitsTree(items, world, kind, t.key) && !isInScope(items, world, t.key, kind)));
}

// Brings an item into a tree's scope at the top (or keeps it there).
export function bringIntoScope(items: Item[], tree: string, thing: string): Item[] {
  return items.map((i) => (i.kind === "link-kind" && i.key === tree && !(i.inScope ?? []).includes(thing) ? { ...i, inScope: [...(i.inScope ?? []), thing] } : i));
}

function dropFromScopeList(items: Item[], tree: string, thing: string): Item[] {
  return items.map((i) => (i.kind === "link-kind" && i.key === tree && (i.inScope ?? []).includes(thing) ? { ...i, inScope: i.inScope!.filter((k) => k !== thing) } : i));
}

// Takes an item out of a tree's scope: out of its container, off the top. What it held moves up to the
// top, still in scope (nothing else leaves with it).
export function removeFromScope(items: Item[], world: string, thing: string, tree?: string): Item[] {
  const kind = treeOrMain(items, world, tree);
  if (!kind) return items;
  let out = items;
  for (const child of childrenOf(items, world, thing, kind)) out = setParent(out, world, child.key, null, kind).items;
  out = out.filter((i) => !(i.kind === "link" && i.world === world && i.linkKind === kind && i.from === thing));
  return dropFromScopeList(out, kind, thing);
}

// Earlier (before 28 Nov) a tree showed its loose items unless it hid them (all, or chosen ones). On
// first reading, those it showed are brought into scope at the top (owner, 28 Nov: "keep them in
// scope"), and the old settings go.
export function upgradeScopes(items: Item[]): Item[] {
  let out = items;
  for (const kind of items.filter((i): i is LinkKind => i.kind === "link-kind" && i.hierarchy === "one parent" && i.inScope === undefined)) {
    const links = treeLinks(out, kind.world, kind.key);
    const linked = new Set(links.flatMap((l) => [l.from, l.to]));
    const shown = kind.loose === "hide" ? [] : thingsIn(out, kind.world).filter((t) => !linked.has(t.key) && fitsTree(out, kind.world, kind.key, t.key) && !(kind.hiddenHere ?? []).includes(t.key)).map((t) => t.key);
    out = out.map((i) => {
      if (i !== kind) return i;
      const { loose, hiddenHere, ...rest } = kind;
      return { ...rest, inScope: shown };
    });
  }
  return out;
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
  return linksIn(items, world).some((l) => (l.to === thing && hierarchical.has(l.linkKind)) || !!l.partOf?.includes(thing));
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
  // At the top, it stays in scope (owner, 28 Nov); inside something, it's in the tree by its link.
  if (!parent) return { items: bringIntoScope(kept, kind, thing) };
  // A container out of scope comes into scope at the top as it takes something in.
  const placed = isInScope(kept, world, parent, kind) ? kept : bringIntoScope(kept, kind, parent);
  return { items: [...dropFromScopeList(placed, kind, thing), newLink(placed, world, thing, kind, parent)] };
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
