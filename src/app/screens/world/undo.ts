// Undo and redo on the Diagram and the map (owner, 26–28 Nov): one history per world, kept by the
// app for every change to the world, whichever screen or card made it (src/world/history.ts), so a
// colour changed on a connector's card opened from the Diagram is the first thing Undo takes back.
import { useState } from "react";
import type { Item } from "../../../items/items";
import type { AppData } from "../../app-data";

export function useUndo(data: AppData, world: string, save: (items: Item[]) => Promise<void>, afterStep?: () => void) {
  const [, setChanged] = useState(0);
  const changed = () => (setChanged((n) => n + 1), afterStep?.());
  // Makes a change: recorded by the app like any other.
  const apply = async (next: Item[]) => {
    await save(next);
    changed();
  };
  const undo = async () => {
    if (await data.undoWorld(world)) changed();
  };
  const redo = async () => {
    if (await data.redoWorld(world)) changed();
  };
  return { apply, undo, redo, canUndo: data.history.canUndo(world), canRedo: data.history.canRedo(world) };
}
