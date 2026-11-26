// World: the tree diagram's layout (owner, 25 Nov: across or down; boxes dragged by hand, the branch
// following or not; back to the automatic layout).
import { describe, expect, it } from "vitest";
import type { Item, Thing } from "../src/items/items";
import { Item as ItemSchema } from "../src/items/items";
import { newWorld, worldOf } from "../src/world/world";
import { arrangedLayout, autoLayout, boxesThatMove, hasHandPlacing, moveBoxes, ROOT, tidyLayout, type Box } from "../src/world/diagram";

const W = "averland-borders";
const sample = () => newWorld([], "Averland borders", "sample");
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;
const tree = (items: Item[]) => worldOf(items, W)!.tree!;
const at = (boxes: Box[], k: string) => boxes.find((b) => b.key === k)!;

describe("the automatic layout", () => {
  it("across: depth runs right; down: depth runs down", () => {
    const items = sample();
    const empire = key(items, "The Empire");
    const averland = key(items, "Averland");
    const across = autoLayout(items, W, tree(items), "across");
    expect(at(across, averland).x).toBeGreaterThan(at(across, empire).x);
    const down = autoLayout(items, W, tree(items), "down");
    expect(at(down, averland).y).toBeGreaterThan(at(down, empire).y);
  });

  it("the world is the root; groups that sit nowhere in the tree are left out", () => {
    const items = sample();
    const boxes = autoLayout(items, W, tree(items), "down");
    expect(at(boxes, ROOT).parent).toBeNull();
    expect(boxes.some((b) => b.thing?.name === "Aver valley")).toBe(false);
  });
});

describe("arranging by hand", () => {
  it("a box alone, or with its branch", () => {
    const items = sample();
    const averland = key(items, "Averland");
    expect(boxesThatMove(items, W, tree(items), averland, false)).toEqual([averland]);
    expect(boxesThatMove(items, W, tree(items), averland, true)).toHaveLength(7); // Averland and its six
  });

  it("moved boxes keep their place, kept on the world, per direction", () => {
    const items = sample();
    const averland = key(items, "Averland");
    const averheim = key(items, "Averheim");
    const before = arrangedLayout(items, W, tree(items), "down");
    const moved = moveBoxes(items, W, tree(items), "down", boxesThatMove(items, W, tree(items), averland, true), 40, -10);
    const after = arrangedLayout(moved, W, tree(items), "down");
    expect(at(after, averland)).toMatchObject({ x: at(before, averland).x + 40, y: at(before, averland).y - 10 });
    expect(at(after, averheim).x).toBe(at(before, averheim).x + 40); // the branch came too
    expect(arrangedLayout(moved, W, tree(items), "across")).toEqual(autoLayout(items, W, tree(items), "across")); // the other direction is untouched
    expect(ItemSchema.safeParse(worldOf(moved, W)).success).toBe(true);
  });

  it("moving again replaces the earlier place; tidy forgets it all", () => {
    const items = sample();
    const nuln = key(items, "Nuln");
    let moved = moveBoxes(items, W, tree(items), "down", [nuln], 10, 0);
    moved = moveBoxes(moved, W, tree(items), "down", [nuln], 10, 0);
    expect(worldOf(moved, W)!.diagrams![0].positions.filter((p) => p.thing === nuln)).toHaveLength(1);
    expect(hasHandPlacing(moved, W, tree(items), "down")).toBe(true);
    const tidied = tidyLayout(moved, W, tree(items), "down");
    expect(hasHandPlacing(tidied, W, tree(items), "down")).toBe(false);
    expect(worldOf(tidied, W)!.diagrams).toBeUndefined();
  });
});

describe("folding a container (owner, 26 Nov)", () => {
  it("a folded box hides its branch and says how many are hidden", () => {
    const items = sample();
    const averland = key(items, "Averland");
    const open = autoLayout(items, W, tree(items), "down");
    const folded = autoLayout(items, W, tree(items), "down", new Set([averland]));
    expect(folded.length).toBe(open.length - 6);
    expect(at(folded, averland)).toMatchObject({ holds: 6, hidden: 6 });
    expect(at(open, averland)).toMatchObject({ holds: 6, hidden: 0 });
  });
});
