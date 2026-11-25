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
