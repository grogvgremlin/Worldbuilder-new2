// A tree as a diagram: where each box goes, laid out automatically, then wherever the owner dragged
// it (owner, 25 Nov: "turn it vertical", "drag the boxes around, the branch moving with it or not").
// Design: design/world-structure.md §5 (abstract views laid out by containment; "Background owns the
// look"): positions are only how the tree is drawn, kept on the world per tree and direction.

import type { Item, Sandbox, Thing } from "../items/items";
import { childrenOf, descendantsOf, topPlaces } from "./places";
import { isOnlyAGroup } from "./groups";
import { worldOf } from "./world";

export type Direction = "across" | "down";
export const ROOT = "(world)"; // the world itself, at the root; never stored as an item

export const NODE_W = 132;
export const NODE_H = 34;
const ACROSS = { depthStep: 168, leafStep: 44 }; // across: depth runs right, leaves run down
const DOWN = { depthStep: 84, leafStep: NODE_W + 14 }; // down: depth runs down, leaves run right

// A box: its top-left corner, and the box above it in the tree.
export type Box = { key: string; thing: Thing | null; parent: string | null; x: number; y: number };

// Leaves one step apart; a parent centred on its children.
export function autoLayout(items: Item[], world: string, tree: string | undefined, direction: Direction): Box[] {
  const step = direction === "across" ? ACROSS : DOWN;
  const boxes: Box[] = [];
  let leaf = 0;
  const place = (thing: Thing | null, key: string, depth: number, parent: string | null, children: Thing[]): number => {
    const spots = children.map((c) => place(c, c.key, depth + 1, key, childrenOf(items, world, c.key, tree)));
    const spot = spots.length ? (spots[0] + spots[spots.length - 1]) / 2 : leaf++ * step.leafStep;
    const along = depth * step.depthStep;
    boxes.push(direction === "across" ? { key, thing, parent, x: along, y: spot } : { key, thing, parent, x: spot, y: along });
    return spot;
  };
  const tops = topPlaces(items, world, tree).filter((t) => !isOnlyAGroup(items, world, t.key));
  place(null, ROOT, 0, null, tops);
  return boxes;
}

function savedFor(items: Item[], world: string, tree: string | undefined, direction: Direction) {
  return worldOf(items, world)?.diagrams?.find((d) => d.tree === tree && d.direction === direction);
}

// The boxes as drawn: where the owner put them, else where the layout puts them.
export function arrangedLayout(items: Item[], world: string, tree: string | undefined, direction: Direction): Box[] {
  const saved = new Map((savedFor(items, world, tree, direction)?.positions ?? []).map((p) => [p.thing, p]));
  return autoLayout(items, world, tree, direction).map((b) => {
    const p = saved.get(b.key);
    return p ? { ...b, x: p.x, y: p.y } : b;
  });
}

// Which boxes move when one is dragged: the box alone, or with everything under it in this tree.
export function boxesThatMove(items: Item[], world: string, tree: string | undefined, key: string, withBranch: boolean): string[] {
  if (!withBranch) return [key];
  return [key, ...descendantsOf(items, world, key, tree).map((t) => t.key)];
}

// Keeps where boxes now are, moved by (dx, dy) from where they were drawn.
export function moveBoxes(items: Item[], world: string, tree: string | undefined, direction: Direction, keys: string[], dx: number, dy: number): Item[] {
  if (!tree) return items;
  const drawn = new Map(arrangedLayout(items, world, tree, direction).map((b) => [b.key, b]));
  const moved = keys.filter((k) => drawn.has(k)).map((k) => ({ thing: k, x: Math.round(drawn.get(k)!.x + dx), y: Math.round(drawn.get(k)!.y + dy) }));
  return updateWorld(items, world, (w) => {
    const others = (w.diagrams ?? []).filter((d) => !(d.tree === tree && d.direction === direction));
    const kept = (savedFor(items, world, tree, direction)?.positions ?? []).filter((p) => !keys.includes(p.thing));
    return { ...w, diagrams: [...others, { tree, direction, positions: [...kept, ...moved] }] };
  });
}

// Forgets the hand placing for this tree and direction: back to the automatic layout.
export function tidyLayout(items: Item[], world: string, tree: string | undefined, direction: Direction): Item[] {
  return updateWorld(items, world, (w) => {
    const rest = (w.diagrams ?? []).filter((d) => !(d.tree === tree && d.direction === direction));
    return { ...w, diagrams: rest.length ? rest : undefined };
  });
}

export function hasHandPlacing(items: Item[], world: string, tree: string | undefined, direction: Direction): boolean {
  return (savedFor(items, world, tree, direction)?.positions.length ?? 0) > 0;
}

function updateWorld(items: Item[], world: string, change: (w: Sandbox) => Sandbox): Item[] {
  return items.map((i) => (i.kind === "sandbox" && i.key === world ? change(i) : i));
}
