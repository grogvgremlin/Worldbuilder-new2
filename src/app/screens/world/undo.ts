// Undo and redo for moves on the Diagram and the map (owner, 26 Nov): each change keeps what this
// world was before it (its items and the world itself; nothing outside it, so Lists is never
// touched). Kept per screen while the app is open; a fresh start forgets.
import { useState } from "react";
import type { Item } from "../../../items/items";
import { isWorldItem } from "../../../world/world";

type Stack = { past: Item[][]; future: Item[][] };
const stacks = new Map<string, Stack>();
const MOST = 50; // steps kept

function belongs(item: Item, world: string): boolean {
  return item.key === world || (isWorldItem(item) && (item as { world: string }).world === world);
}

function snapshot(items: Item[], world: string): Item[] {
  return items.filter((i) => belongs(i, world));
}

// Everything outside the world as it is now, and the world as it was in the snapshot.
function restore(items: Item[], world: string, snap: Item[]): Item[] {
  return [...items.filter((i) => !belongs(i, world)), ...snap];
}

export function useUndo(screen: string, world: string, items: () => Item[], save: (items: Item[]) => Promise<void>) {
  const [, setChanged] = useState(0);
  const name = `${screen}|${world}`;
  if (!stacks.has(name)) stacks.set(name, { past: [], future: [] });
  const stack = stacks.get(name)!;
  const changed = () => setChanged((n) => n + 1);

  // Makes a change that can be undone.
  const apply = async (next: Item[]) => {
    stack.past = [...stack.past, snapshot(items(), world)].slice(-MOST);
    stack.future = [];
    await save(next);
    changed();
  };
  const undo = async () => {
    const before = stack.past.pop();
    if (!before) return;
    stack.future.push(snapshot(items(), world));
    await save(restore(items(), world, before));
    changed();
  };
  const redo = async () => {
    const after = stack.future.pop();
    if (!after) return;
    stack.past.push(snapshot(items(), world));
    await save(restore(items(), world, after));
    changed();
  };
  return { apply, undo, redo, canUndo: stack.past.length > 0, canRedo: stack.future.length > 0 };
}
