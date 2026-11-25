// Places grouped by containment: a place's parent, its contents, its path, and the tree.
// Design: design/world-structure.md §3 (hierarchy is a kind of link with stricter rules: one parent
// at a time, no loops), §4 (containment is a tree link kind), §11 (a loop is an error; the rest
// warns). Which link kind is the tree is the world's choice (`tree` on the world), never a name.

import type { Item, Link, Thing } from "../items/items";
import { linksIn, newLink, thingsIn, worldOf } from "./world";

// The containment links of a world.
function treeLinks(items: Item[], world: string): Link[] {
  const tree = worldOf(items, world)?.tree;
  if (!tree) return [];
  return linksIn(items, world).filter((l) => l.linkKind === tree);
}

// A place's parent, or null at the top. With more than one (from an upload), the first; see
// `treeWarnings`.
export function parentOf(items: Item[], world: string, thing: string): string | null {
  return treeLinks(items, world).find((l) => l.from === thing)?.to ?? null;
}

export function childrenOf(items: Item[], world: string, thing: string): Thing[] {
  const keys = new Set(treeLinks(items, world).filter((l) => l.to === thing).map((l) => l.from));
  return byName(thingsIn(items, world).filter((t) => keys.has(t.key)));
}

// Everything inside a place, at any depth.
export function descendantsOf(items: Item[], world: string, thing: string): Thing[] {
  const out: Thing[] = [];
  const seen = new Set([thing]);
  const walk = (key: string) => {
    for (const child of childrenOf(items, world, key)) {
      if (seen.has(child.key)) continue; // a loop from an upload: don't walk forever
      seen.add(child.key);
      out.push(child);
      walk(child.key);
    }
  };
  walk(thing);
  return out;
}

// From the top down to the place itself: The Empire › Averland › Averheim.
export function pathOf(items: Item[], world: string, thing: string): Thing[] {
  const things = new Map(thingsIn(items, world).map((t) => [t.key, t]));
  const path: Thing[] = [];
  const seen = new Set<string>();
  let at: string | null = thing;
  while (at && !seen.has(at) && things.has(at)) {
    seen.add(at);
    path.unshift(things.get(at)!);
    at = parentOf(items, world, at);
  }
  return path;
}

// The places with no parent: the top of the tree.
export function topPlaces(items: Item[], world: string): Thing[] {
  const hasParent = new Set(treeLinks(items, world).map((l) => l.from));
  return byName(thingsIn(items, world).filter((t) => !hasParent.has(t.key)));
}

// How deep a place sits: 0 at the top.
export function depthOf(items: Item[], world: string, thing: string): number {
  return pathOf(items, world, thing).length - 1;
}

// Puts a place inside another (or at the top, with null). Refused if it would make a loop:
// a place can't be inside itself or anything it holds.
export function setParent(items: Item[], world: string, thing: string, parent: string | null): { items: Item[]; problem?: string } {
  const tree = worldOf(items, world)?.tree;
  if (!tree) return { items, problem: "this world has no containment link kind (World → Kinds)" };
  if (parent === thing) return { items, problem: "a place can't be inside itself" };
  if (parent && descendantsOf(items, world, thing).some((d) => d.key === parent)) return { items, problem: "that place is inside this one already" };
  const kept = items.filter((i) => !(i.kind === "link" && i.world === world && i.linkKind === tree && i.from === thing));
  if (!parent) return { items: kept };
  return { items: [...kept, newLink(kept, world, thing, tree, parent)] };
}

// What can't be walked or looks wrong in the tree (§11): two parents at once; a loop.
export function treeWarnings(items: Item[], world: string): string[] {
  const names = new Map(thingsIn(items, world).map((t) => [t.key, t.name]));
  const out: string[] = [];
  const parents = new Map<string, string[]>();
  for (const l of treeLinks(items, world)) parents.set(l.from, [...(parents.get(l.from) ?? []), l.to]);
  for (const [child, ps] of parents) {
    if (ps.length > 1) out.push(`${names.get(child) ?? child} is in ${ps.map((p) => names.get(p) ?? p).join(" and ")} at once`);
  }
  for (const t of thingsIn(items, world)) {
    let at = parentOf(items, world, t.key);
    const seen = new Set([t.key]);
    while (at) {
      if (seen.has(at)) {
        if (at === t.key) out.push(`${t.name} is inside itself (a loop)`);
        break;
      }
      seen.add(at);
      at = parentOf(items, world, at);
    }
  }
  return out;
}

function byName(things: Thing[]): Thing[] {
  return [...things].sort((a, b) => a.name.localeCompare(b.name));
}
