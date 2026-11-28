// World: one undo history per world (owner, 28 Nov: "I created a road connector, joined two places,
// went to that instance of the road and changed the colour … I'd expect the first step to be undoing
// the colour"). Every change to a world is kept, whichever screen made it; quick changes to one item
// are one step; other worlds and the library are untouched.
import { describe, expect, it } from "vitest";
import type { Item, Link } from "../src/items/items";
import { newWorld } from "../src/world/world";
import { WorldHistory } from "../src/world/history";

function withLink(items: Item[], colour?: string): Item[] {
  const link: Link = { key: "mine.link.a-b", kind: "link", world: "mine", name: "", from: "a", linkKind: "k", to: "b", ...(colour ? { colour } : {}) };
  return [...items.filter((i) => i.key !== link.key), link];
}

describe("a world's history", () => {
  it("steps back through changes in order, the last first", async () => {
    const h = new WorldHistory();
    const start = newWorld([], "Mine", "starter");
    const joined = withLink(start);
    h.record(start, joined);
    await new Promise((r) => setTimeout(r, 5));
    const coloured = withLink(start, "#ff0000");
    (h as unknown as { stacks: Map<string, { lastAt: number }> }).stacks.get("mine")!.lastAt = 0; // a while later
    h.record(joined, coloured);
    const back = h.undo(coloured, "mine")!;
    expect((back.find((i) => i.key === "mine.link.a-b") as Link).colour).toBeUndefined(); // the colour first
    const back2 = h.undo(back, "mine")!;
    expect(back2.some((i) => i.key === "mine.link.a-b")).toBe(false); // then the connector
    expect((h.redo(back2, "mine")!).some((i) => i.key === "mine.link.a-b")).toBe(true);
  });

  it("quick changes to one item are one step; nothing outside the world is touched", () => {
    const h = new WorldHistory();
    const start = withLink(newWorld([], "Mine", "starter"));
    const other: Item = { key: "lib", kind: "setting-value", setting: "x", value: "1", name: "lib" } as unknown as Item;
    h.record(start, withLink(start, "#111111"));
    h.record(withLink(start, "#111111"), withLink(start, "#222222"));
    const back = h.undo([...withLink(start, "#222222"), other], "mine")!;
    expect((back.find((i) => i.key === "mine.link.a-b") as Link).colour).toBeUndefined();
    expect(back.some((i) => i.key === "lib")).toBe(true);
    expect(h.canUndo("mine")).toBe(false);
  });
});
