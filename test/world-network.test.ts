// World: a network on the Diagram (owner, 27 Nov: "a link type treated like a tree view: loose items,
// hide items, the network"). A connection link kind's items as boxes, laid out in layers out from its
// best-joined item; loose items after; hidden ones left out.
import { describe, expect, it } from "vitest";
import type { Item, LinkKind, Thing } from "../src/items/items";
import { linkKindsIn, newWorld, thingKindsIn } from "../src/world/world";
import { isNetwork, networkItems, networkKinds, networkLayers } from "../src/world/network";
import { arrangedLayout, boxesThatMove, moveBoxes } from "../src/world/diagram";
import { join } from "../src/world/links";
import { hiddenIn, hideHere } from "../src/world/places";

const W = "mine";
const key = (name: string) => `${W}.thing.${name}`;

function setUp() {
  const start = newWorld([], "Mine", "starter");
  const place = thingKindsIn(start, W)[0].key;
  const thing = (name: string): Thing => ({ key: key(name), kind: "thing", world: W, name, kinds: [place], fields: [] });
  let items: Item[] = [...start, ...["a", "b", "c", "d", "lonely"].map(thing)];
  const road = linkKindsIn(items, W).find((k) => k.name === "adjacent to")!.key;
  for (const [x, y] of [["a", "b"], ["a", "c"], ["c", "d"]]) items = join(items, W, key(x), road, key(y)).items;
  return { items, road, tree: linkKindsIn(items, W).find((k) => k.name === "in")!.key };
}

describe("a network", () => {
  it("is a connection link kind; trees and groups aren't", () => {
    const { items, road, tree } = setUp();
    expect(networkKinds(items, W).map((k) => k.key)).toEqual([road]);
    expect([isNetwork(items, W, road), isNetwork(items, W, tree)]).toEqual([true, false]);
  });

  it("lays its items out in layers from the best-joined", () => {
    const { items, road } = setUp();
    expect(networkLayers(items, W, road).map((part) => part.map((layer) => layer.map((t) => t.name)))).toEqual([[["a"], ["b", "c"], ["d"]]]);
  });

  it("shows its loose items after, unless hidden, all or by hand", () => {
    const { items, road } = setUp();
    expect(networkItems(items, W, road).loose.map((t) => t.name)).toEqual(["lonely"]);
    const byHand = hideHere(items, road, key("lonely"), true);
    expect(networkItems(byHand, W, road).loose).toEqual([]);
    const all = items.map((i) => (i.key === road ? { ...(i as LinkKind), loose: "hide" as const } : i));
    expect(networkItems(all, W, road).loose).toEqual([]);
    expect(arrangedLayout(byHand, W, road, "across").map((b) => b.thing?.name).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("joined, a hidden item is in the network by choice: no longer hidden", () => {
    const { items, road } = setUp();
    const hidden = hideHere(items, road, key("lonely"), true);
    const joined = join(hidden, W, key("lonely"), road, key("d")).items;
    expect(hiddenIn(joined, W, road, key("lonely"))).toBeNull();
  });

  it("has no world box and no branches; boxes keep where they're dragged", () => {
    const { items, road } = setUp();
    const boxes = arrangedLayout(items, W, road, "down");
    expect(boxes.some((b) => b.thing === null)).toBe(false);
    expect(boxesThatMove(items, W, road, key("a"), true)).toEqual([key("a")]);
    const moved = moveBoxes(items, W, road, "down", [key("a")], 10, 20);
    const a = boxes.find((b) => b.key === key("a"))!;
    expect(arrangedLayout(moved, W, road, "down").find((b) => b.key === key("a"))).toMatchObject({ x: a.x + 10, y: a.y + 20 });
  });
});
