// Maps: pinning things, moving and removing pins, and the areas a map shows.
// Design: design/world-structure.md §5 (pin things to a map; pins stored per map in its own
// coordinates; drawn maps unreliable for scale), §5.1; spec/pillars/background-and-narrative.md §6
// (pin icons from the thing's kind; labels from names).
// Areas here are worked out, never stored: a place holding pinned places is drawn as a soft shape
// around them (containment shown on the map), and so is a group round its pinned members. Groups
// captured by a drawn shape (§5.1) come later.

import type { Item, Pin, Thing, WorldMap } from "../items/items";
import { descendantsOf, depthOf } from "./places";
import { groupsIn, membersOf } from "./groups";
import { newKey, thingsIn } from "./world";
import { kindLine } from "./kinds";

export function newMap(items: Item[], world: string, name: string): WorldMap {
  return { key: newKey(items, world, "map", name), kind: "map", world, name: name.trim() || "Map", width: 1000, height: 700, pins: [] };
}

export function pinOf(map: WorldMap, thing: string): Pin | undefined {
  return map.pins.find((p) => p.thing === thing);
}

// Pins a thing at a point, or moves its pin there. Points are kept inside the map.
export function placePin(map: WorldMap, thing: string, x: number, y: number): WorldMap {
  const at = { x: clamp(Math.round(x), 0, map.width), y: clamp(Math.round(y), 0, map.height) };
  const pins = pinOf(map, thing) ? map.pins.map((p) => (p.thing === thing ? { ...p, ...at } : p)) : [...map.pins, { thing, ...at }];
  return { ...map, pins };
}

export function removePin(map: WorldMap, thing: string): WorldMap {
  return { ...map, pins: map.pins.filter((p) => p.thing !== thing) };
}

// The world's things not yet on this map.
export function notOnMap(items: Item[], map: WorldMap): Thing[] {
  const pinned = new Set(map.pins.map((p) => p.thing));
  return thingsIn(items, map.world).filter((t) => !pinned.has(t.key)).sort((a, b) => a.name.localeCompare(b.name));
}

// The maps a thing is pinned on.
export function mapsShowing(items: Item[], thing: string): WorldMap[] {
  return items.filter((i): i is WorldMap => i.kind === "map" && i.pins.some((p) => p.thing === thing));
}

// The icon a thing shows: its own, else its first kind's that has one, looking up through the kinds
// it's a flavour of (a City with no icon of its own shows Place's).
export function iconOf(items: Item[], thing: Thing): string {
  if (thing.icon) return thing.icon;
  for (const k of thing.kinds) {
    const icon = kindLine(items, thing.world, k).find((kind) => kind.icon)?.icon;
    if (icon) return icon;
  }
  return "•";
}

// --- Areas: places that hold pinned places, as shapes around them --------------------------------

export type Area = {
  thing: Thing;
  by: "containment" | "group"; // what it shows: what a place holds, or a group's members
  depth: number; // 0 at the top of the tree; deeper areas are drawn tighter, on top
  outline: { x: number; y: number }[]; // the convex hull of the pinned points inside it
};

// One area per item holding at least one pinned item (its own pin counts too), in one tree (the
// main one unless another is chosen).
export function areasOn(items: Item[], map: WorldMap, tree?: string): Area[] {
  const pins = new Map(map.pins.map((p) => [p.thing, p]));
  const out: Area[] = [];
  for (const thing of thingsIn(items, map.world)) {
    const inside = descendantsOf(items, map.world, thing.key, tree).filter((d) => pins.has(d.key));
    if (inside.length === 0) continue;
    const points = [...inside, thing].map((t) => pins.get(t.key)).filter((p): p is Pin => !!p);
    out.push({ thing, by: "containment", depth: depthOf(items, map.world, thing.key, tree), outline: convexHull(points.map((p) => ({ x: p.x, y: p.y }))) });
  }
  return out.sort((a, b) => a.depth - b.depth || a.thing.name.localeCompare(b.thing.name));
}

// One area per group with something pinned: round its members, and what they hold, as pinned here.
export function groupAreasOn(items: Item[], map: WorldMap): Area[] {
  const pins = new Map(map.pins.map((p) => [p.thing, p]));
  const out: Area[] = [];
  for (const group of groupsIn(items, map.world)) {
    const members = membersOf(items, map.world, group.key).map((m) => m.thing);
    const inside = members.flatMap((m) => [m, ...descendantsOf(items, map.world, m.key)]);
    const points = [...new Map(inside.map((t) => [t.key, pins.get(t.key)])).values()].filter((p): p is Pin => !!p);
    if (points.length === 0) continue;
    out.push({ thing: group, by: "group", depth: 0, outline: convexHull(points.map((p) => ({ x: p.x, y: p.y }))) });
  }
  return out;
}

// The smallest convex shape around the points (Andrew's monotone chain).
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const ps = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
type Pt = { x: number; y: number };

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}
