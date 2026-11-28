// A tree as a diagram: where each box goes, laid out automatically, then wherever the owner dragged
// it (owner, 25 Nov: "turn it vertical", "drag the boxes around, the branch moving with it or not").
// Design: design/world-structure.md §5 (abstract views laid out by containment; "Background owns the
// look"): positions are only how the tree is drawn, kept on the world per tree and direction.

import type { Item, Sandbox, Thing } from "../items/items";
import { childrenOf, descendantsOf, topPlaces } from "./places";
import { isOnlyAGroup } from "./groups";
import { worldOf } from "./world";
import { GROUPS, groupsOfView, isNetwork, networkItems, networkLayers } from "./network";
import { effectiveMembers } from "./groups";

export type Direction = "across" | "down";
export const ROOT = "(world)"; // the world itself, at the root; never stored as an item

export const NODE_W = 132;
export const NODE_H = 34;
const ACROSS = { depthStep: 168, leafStep: 44 }; // across: depth runs right, leaves run down
const DOWN = { depthStep: 84, leafStep: NODE_W + 14 }; // down: depth runs down, leaves run right

// A box: its top-left corner, the box above it in the tree, and how many items it holds (any depth)
// and, folded, how many of those are hidden (owner, 26 Nov: "a collapse button on a container").
export type Box = { key: string; thing: Thing | null; parent: string | null; x: number; y: number; holds: number; hidden: number };

// Leaves one step apart; a parent centred on its children. A network (a connection link kind) is laid
// out by its own rule: networkLayout.
export function autoLayout(items: Item[], world: string, tree: string | undefined, direction: Direction, folded: Set<string> = new Set(), workspace: string[] = []): Box[] {
  if (tree?.startsWith(GROUPS)) return groupLayout(items, world, groupsOfView(tree), direction).boxes;
  if (isNetwork(items, world, tree)) return networkLayout(items, world, tree!, direction, workspace);
  const step = direction === "across" ? ACROSS : DOWN;
  const boxes: Box[] = [];
  let leaf = 0;
  const place = (thing: Thing | null, key: string, depth: number, parent: string | null, children: Thing[]): number => {
    const holds = thing ? descendantsOf(items, world, key, tree).length : 0;
    const shown = folded.has(key) ? [] : children; // a folded box hides its branch
    const spots = shown.map((c) => place(c, c.key, depth + 1, key, childrenOf(items, world, c.key, tree)));
    const spot = spots.length ? (spots[0] + spots[spots.length - 1]) / 2 : leaf++ * step.leafStep;
    const along = depth * step.depthStep;
    const hidden = folded.has(key) ? holds : 0;
    boxes.push(direction === "across" ? { key, thing, parent, x: along, y: spot, holds, hidden } : { key, thing, parent, x: spot, y: along, holds, hidden });
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
export function arrangedLayout(items: Item[], world: string, tree: string | undefined, direction: Direction, folded: Set<string> = new Set(), workspace: string[] = []): Box[] {
  const saved = new Map((savedFor(items, world, tree, direction)?.positions ?? []).map((p) => [p.thing, p]));
  return autoLayout(items, world, tree, direction, folded, workspace).map((b) => {
    const p = saved.get(b.key);
    return p ? { ...b, x: p.x, y: p.y } : b;
  });
}

// A network: each part in layers out from its best-joined item (across: layers run right, an item's
// layer down the page; down: the other way round); parts one after another; loose items in a last
// row (across: column) after them. No world box: a network has no top.
export function networkLayout(items: Item[], world: string, kind: string, direction: Direction, workspace: string[] = []): Box[] {
  const step = direction === "across" ? ACROSS : DOWN;
  const boxes: Box[] = [];
  const put = (thing: Thing, along: number, spot: number) =>
    boxes.push(direction === "across" ? { key: thing.key, thing, parent: null, x: along * step.depthStep, y: spot * step.leafStep, holds: 0, hidden: 0 } : { key: thing.key, thing, parent: null, x: spot * step.leafStep, y: along * step.depthStep, holds: 0, hidden: 0 });
  let start = 0; // the first free spot along the leaf axis
  for (const layers of networkLayers(items, world, kind)) {
    const widest = Math.max(...layers.map((l) => l.length));
    layers.forEach((layer, along) => layer.forEach((t, n) => put(t, along, start + n + (widest - layer.length) / 2)));
    start += widest + 1;
  }
  const loose = networkItems(items, world, kind, workspace).loose; // the workspace: brought in to be joined
  const perLine = 6;
  loose.forEach((t, n) => put(t, n % perLine, start + Math.floor(n / perLine)));
  return boxes;
}

// Which boxes move when one is dragged: the box alone, or with everything under it in this tree (a
// network has no branches: the box alone).
export function boxesThatMove(items: Item[], world: string, tree: string | undefined, key: string, withBranch: boolean): string[] {
  if (!withBranch || isNetwork(items, world, tree) || tree?.startsWith(GROUPS)) return [key];
  return [key, ...descendantsOf(items, world, key, tree).map((t) => t.key)];
}

// Keeps where boxes now are, moved by (dx, dy) from where they were drawn.
export function moveBoxes(items: Item[], world: string, tree: string | undefined, direction: Direction, keys: string[], dx: number, dy: number, workspace: string[] = []): Item[] {
  if (!tree) return items;
  const drawn = new Map(arrangedLayout(items, world, tree, direction, new Set(), workspace).map((b) => [b.key, b]));
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

// Groups as mini diagrams (owner, 28 Nov): each group a frame, its members' boxes in a grid inside;
// frames one after another (across: in a row; down: in a column). Worked out each time.
export type Frame = { group: Thing; x: number; y: number; w: number; h: number };
const FRAME_PAD = 14;
const FRAME_TITLE = 26;

export function groupLayout(items: Item[], world: string, groups: string[], direction: Direction): { frames: Frame[]; boxes: Box[] } {
  const frames: Frame[] = [];
  const boxes: Box[] = [];
  let at = 0;
  for (const key of groups) {
    const group = items.find((i): i is Thing => i.kind === "thing" && i.key === key);
    if (!group) continue;
    const members = effectiveMembers(items, world, key).map((m) => m.thing).sort((a, b) => a.name.localeCompare(b.name));
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(members.length))));
    const rows = Math.max(1, Math.ceil(members.length / cols));
    const w = FRAME_PAD * 2 + cols * NODE_W + (cols - 1) * 12;
    const h = FRAME_TITLE + FRAME_PAD + rows * NODE_H + (rows - 1) * 10;
    const [fx, fy] = direction === "across" ? [at, 0] : [0, at];
    frames.push({ group, x: fx, y: fy, w, h });
    members.forEach((m, n) => {
      const x = fx + FRAME_PAD + (n % cols) * (NODE_W + 12);
      const y = fy + FRAME_TITLE + Math.floor(n / cols) * (NODE_H + 10);
      boxes.push({ key: `${key}::${m.key}`, thing: m, parent: null, x, y, holds: 0, hidden: 0 });
    });
    at += (direction === "across" ? w : h) + 36;
  }
  return { frames, boxes };
}
