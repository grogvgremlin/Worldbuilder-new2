// What a world's screens were showing (its tab, Tree or Groups, the tree chosen), remembered while
// the app is open, so Back returns to where you were rather than the world's first tab (owner,
// 25 Nov). A view setting: never stored with the world.
import { useState } from "react";

const memory = new Map<string, unknown>();

export function useRemembered<T>(key: string, start: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : start));
  const set = (next: T) => {
    memory.set(key, next);
    setValue(next);
  };
  return [value, set];
}

// The same, kept on this device across visits (the diagram's direction and drag mode): a view
// setting, never stored with the world. Falls back to memory where the device keeps nothing.
export function useKept<T>(key: string, start: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`worldbuilder.view.${key}`);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      // nothing kept: start afresh
    }
    return start;
  });
  const set = (next: T) => {
    try {
      localStorage.setItem(`worldbuilder.view.${key}`, JSON.stringify(next));
    } catch {
      // not kept: applies until the app closes
    }
    setValue(next);
  };
  return [value, set];
}

// Sets a remembered view from outside its screen (the trail's Items · Diagram · Maps).
export function remember<T>(key: string, value: T): void {
  memory.set(key, value);
}

// Sets every remembered view starting with a prefix, and the value for ones not seen yet (the item
// card's "Fold all / Open all": owner, 26 Nov).
export function rememberAll(prefix: string, value: unknown): void {
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.set(key, value);
  memory.set(`${prefix}*`, value);
}

// A remembered value, else the prefix's value set by rememberAll, else the start.
export function recalled<T>(key: string, prefix: string, start: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  if (memory.has(`${prefix}*`)) return memory.get(`${prefix}*`) as T;
  return start;
}
