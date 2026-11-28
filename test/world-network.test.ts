// World: a network on the Diagram (owner, 27 Nov: "a link type treated like a tree view: loose items,
// hide items, the network"). A connection link kind's items as boxes, laid out in layers out from its
// best-joined item; loose items after; hidden ones left out.
import { describe, expect, it } from "vitest";
import type { Item, LinkKind, Thing } from "../src/items/items";
import { linkKindsIn, newWorld, thingKindsIn } from "../src/world/world";
import { isNetwork, networkItems, networkKinds, networkLayers } from "../src/world/network";
import { arrangedLayout, boxesThatMove, moveBoxes } from "../src/world/diagram";
import { join } from "../src/world/links";


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

  it("its scope: joined items; a workspace brings others in for now; the rest it would join are out of scope", async () => {
    const { networkOutOfScope } = await import("../src/world/network");
    const { items, road } = setUp();
    expect(networkItems(items, W, road).loose).toEqual([]);
    expect(networkOutOfScope(items, W, road).map((t) => t.name)).toEqual(["lonely"]);
    expect(networkItems(items, W, road, [key("lonely")]).loose.map((t) => t.name)).toEqual(["lonely"]);
    expect(networkOutOfScope(items, W, road, [key("lonely")])).toEqual([]);
    expect(arrangedLayout(items, W, road, "across").map((b) => b.thing?.name).sort()).toEqual(["a", "b", "c", "d"]);
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

describe("several networks at once, and groups as mini diagrams (owner, 28 Nov)", () => {
  it("two network types shown together: one view, joined by either", async () => {
    const { networksViewKey, kindsOfView, isNetwork } = await import("../src/world/network");
    const { items, road } = setUp();
    const river: LinkKind = { key: `${W}.link-kind.river`, kind: "link-kind", world: W, name: "river", direction: "both ways", hierarchy: "none" };
    const both = join([...items, river], W, key("d"), river.key, key("lonely")).items;
    const view = networksViewKey([road, river.key]);
    expect(kindsOfView(view).sort()).toEqual([road, river.key].sort());
    expect(isNetwork(both, W, view)).toBe(true);
    expect(arrangedLayout(both, W, view, "across").map((b) => b.thing?.name).sort()).toEqual(["a", "b", "c", "d", "lonely"]);
    expect(networksViewKey([road])).toBe(road); // one alone keeps its own key
  });

  it("groups shown together: a frame each, its members inside; a member of both is in both", async () => {
    const { groupLayout } = await import("../src/world/diagram");
    const { addToGroup, groupLinkKinds, groupOutOfScope } = await import("../src/world/groups");
    const { items } = setUp();
    const inArea = groupLinkKinds(items, W)[0].key;
    let next = addToGroup(items, W, key("a"), inArea, key("c")).items;
    next = addToGroup(next, W, key("b"), inArea, key("c")).items;
    next = addToGroup(next, W, key("a"), inArea, key("d")).items;
    const { frames, boxes } = groupLayout(next, W, [key("c"), key("d")], "across");
    expect(frames.map((f) => f.group.name)).toEqual(["c", "d"]);
    expect(boxes.map((b) => b.key)).toEqual([`${key("c")}::${key("a")}`, `${key("c")}::${key("b")}`, `${key("d")}::${key("a")}`]);
    const inFrame = (b: { x: number; y: number }, f: { x: number; y: number; w: number; h: number }) => b.x >= f.x && b.x <= f.x + f.w && b.y >= f.y && b.y <= f.y + f.h;
    expect(boxes.every((b) => frames.some((f) => inFrame(b, f) && b.key.startsWith(f.group.key)))).toBe(true);
    expect(groupOutOfScope(next, W, [key("c"), key("d")]).map((t) => t.name)).toEqual(["lonely"]);
  });
});
