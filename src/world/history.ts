// One undo history per world (owner, 28 Nov: "undo should be able to undo actions launched from
// diagrams … I'd expect the first step to be undoing the colour"): every change to a world's items is
// kept, whichever screen or card made it, so Undo on the Diagram or a map steps back through them all
// in order. Quick runs of changes to one item (a colour being dragged, a name typed) count as one step.
// Kept while the app is open; a fresh start forgets. Nothing outside the world is touched.
import type { Item } from "../items/items";
import { isWorldItem } from "./world";

type Stack = { past: Item[][]; future: Item[][]; lastAt: number; lastKey: string };
const MOST = 100; // steps kept per world
const TOGETHER_MS = 1200; // changes to the same item this close together are one step

export function belongsTo(item: Item, world: string): boolean {
  return item.key === world || (isWorldItem(item) && (item as { world: string }).world === world);
}

export function worldItemsOf(items: Item[], world: string): Item[] {
  return items.filter((i) => belongsTo(i, world));
}

// Everything outside the world as it is now, and the world as it was in the snapshot.
export function restoreWorld(items: Item[], world: string, snap: Item[]): Item[] {
  return [...items.filter((i) => !belongsTo(i, world)), ...snap];
}

export class WorldHistory {
  private stacks = new Map<string, Stack>();

  private stack(world: string): Stack {
    if (!this.stacks.has(world)) this.stacks.set(world, { past: [], future: [], lastAt: 0, lastKey: "" });
    return this.stacks.get(world)!;
  }

  // Before `next` replaces `before`: keeps each changed world as it was.
  record(before: Item[], next: Item[]) {
    const worlds = before.filter((i) => i.kind === "sandbox" && i.world).map((i) => i.key);
    for (const world of worlds) {
      const was = worldItemsOf(before, world);
      const now = worldItemsOf(next, world);
      const changed = changedKeys(was, now);
      if (changed.length === 0) continue;
      const stack = this.stack(world);
      const key = changed.length === 1 ? changed[0] : "";
      const together = key && key === stack.lastKey && Date.now() - stack.lastAt < TOGETHER_MS && stack.past.length > 0;
      if (!together) stack.past = [...stack.past, was].slice(-MOST);
      stack.future = [];
      stack.lastAt = Date.now();
      stack.lastKey = key;
    }
  }

  // The world as it was before the last change (and the present kept for redo), or null.
  undo(items: Item[], world: string): Item[] | null {
    const stack = this.stack(world);
    const before = stack.past.pop();
    if (!before) return null;
    stack.future.push(worldItemsOf(items, world));
    stack.lastKey = "";
    return restoreWorld(items, world, before);
  }

  redo(items: Item[], world: string): Item[] | null {
    const stack = this.stack(world);
    const after = stack.future.pop();
    if (!after) return null;
    stack.past.push(worldItemsOf(items, world));
    stack.lastKey = "";
    return restoreWorld(items, world, after);
  }

  canUndo(world: string) {
    return this.stack(world).past.length > 0;
  }

  canRedo(world: string) {
    return this.stack(world).future.length > 0;
  }
}

// The keys of items added, removed or changed between two versions of a world.
function changedKeys(was: Item[], now: Item[]): string[] {
  const before = new Map(was.map((i) => [i.key, JSON.stringify(i)]));
  const after = new Map(now.map((i) => [i.key, JSON.stringify(i)]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => before.get(k) !== after.get(k));
}
