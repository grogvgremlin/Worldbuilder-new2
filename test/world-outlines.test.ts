// World: outlines on the Diagram (owner, 26 Nov): groups and other trees' containers.
import { describe, expect, it } from "vitest";
import type { Item, Thing } from "../src/items/items";
import { newWorld } from "../src/world/world";
import { groupOutlines, treeOutlines } from "../src/world/outlines";
import { setParent } from "../src/world/places";

const W = "averland-borders";
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;

describe("outlines", () => {
  it("each group with its members", () => {
    const items = newWorld([], "Averland borders", "sample");
    const valley = groupOutlines(items, W).find((o) => o.thing.name === "Aver valley")!;
    expect(valley.members.length).toBe(4);
  });

  it("each container in another tree, with what it holds there", () => {
    const items = newWorld([], "Averland borders", "sample");
    const terrain: Item = { key: `${W}.link-kind.terrain`, kind: "link-kind", world: W, name: "in terrain", direction: "one-way", hierarchy: "one parent", strictness: "warn" };
    const hills: Item = { key: `${W}.thing.hills`, kind: "thing", world: W, name: "Hills", kinds: [], fields: [] };
    const placed = setParent([...items, terrain, hills], W, key(items, "Heideck"), hills.key, terrain.key).items;
    expect(treeOutlines(placed, W, terrain.key).map((o) => [o.thing.name, o.members.length])).toEqual([["Hills", 1]]);
  });
});
