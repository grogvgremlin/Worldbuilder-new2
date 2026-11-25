// World: groups of places (area things, many-to-many) beside containment.
// Design: design/world-structure.md §3–4; spec/foundations/reach.md §7. Owner, 25 Nov: the bridge
// town's halves each sit in their own province; the town as a whole groups the two (option A).
import { describe, expect, it } from "vitest";
import type { Item, Thing } from "../src/items/items";
import { mapsIn, newWorld, removeThing } from "../src/world/world";
import { addToGroup, groupLinkKinds, groupsIn, groupsOf, isOnlyAGroup, membersOf, removeFromGroup } from "../src/world/groups";
import { parentOf, topPlaces } from "../src/world/places";
import { groupAreasOn } from "../src/world/maps";

const W = "averland-borders";
const sample = () => newWorld([], "Averland borders", "sample");
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;
const inArea = (items: Item[]) => groupLinkKinds(items, W)[0].key;

describe("the bridge town (option A)", () => {
  it("each half sits in its own province; the town groups both", () => {
    const items = sample();
    expect(parentOf(items, W, key(items, "Zweibrücken (west bank)"))).toBe(key(items, "Wissenland"));
    expect(parentOf(items, W, key(items, "Zweibrücken (east bank)"))).toBe(key(items, "Averland"));
    expect(membersOf(items, W, key(items, "Zweibrücken")).map((m) => m.thing.name)).toEqual(["Zweibrücken (east bank)", "Zweibrücken (west bank)"]);
  });

  it("the town as a whole is only a group: out of the tree, in the groups", () => {
    const items = sample();
    expect(isOnlyAGroup(items, W, key(items, "Zweibrücken"))).toBe(true);
    expect(isOnlyAGroup(items, W, key(items, "Averland"))).toBe(false);
    expect(groupsIn(items, W).map((g) => g.name)).toEqual(["Aver valley", "Zweibrücken"]);
    expect(topPlaces(items, W).map((t) => t.name)).toContain("Zweibrücken"); // the tree's own top; the screen leaves groups out
  });
});

describe("many groups at once", () => {
  it("a place can be in several groups, and groups can hold groups", () => {
    const items = sample();
    expect(groupsOf(items, W, key(items, "Nuln")).map((g) => g.thing.name)).toEqual(["Aver valley"]);
    expect(groupsOf(items, W, key(items, "Zweibrücken")).map((g) => g.thing.name)).toEqual(["Aver valley"]);
    const added = addToGroup(items, W, key(items, "Nuln"), inArea(items), key(items, "Zweibrücken"));
    expect(added.problem).toBeUndefined();
    expect(groupsOf(added.items, W, key(items, "Nuln")).map((g) => g.thing.name)).toEqual(["Aver valley", "Zweibrücken"]);
  });

  it("refuses itself, twice, and loops", () => {
    const items = sample();
    const valley = key(items, "Aver valley");
    expect(addToGroup(items, W, valley, inArea(items), valley).problem).toMatch(/itself/);
    expect(addToGroup(items, W, key(items, "Nuln"), inArea(items), valley).problem).toMatch(/already/);
    // Zweibrücken is in the valley, so the valley can't go in Zweibrücken.
    expect(addToGroup(items, W, valley, inArea(items), key(items, "Zweibrücken")).problem).toMatch(/inside this one/);
  });

  it("taking a place out of a group leaves its other groups", () => {
    const items = sample();
    const after = removeFromGroup(items, W, key(items, "Nuln"), inArea(items), key(items, "Aver valley"));
    expect(groupsOf(after, W, key(items, "Nuln"))).toEqual([]);
    expect(membersOf(after, W, key(items, "Aver valley")).map((m) => m.thing.name)).toEqual(["Averheim", "Streissen", "Zweibrücken"]);
  });

  it("removing a group takes its memberships, not its members", () => {
    const items = sample();
    const after = removeThing(items, key(items, "Zweibrücken"));
    expect(groupsIn(after, W).map((g) => g.name)).toEqual(["Aver valley"]);
    expect(after.some((i) => i.kind === "thing" && i.name === "Zweibrücken (east bank)")).toBe(true);
  });
});

describe("groups on a map", () => {
  it("a group is drawn round its pinned members, and what they hold", () => {
    const items = sample();
    const areas = groupAreasOn(items, mapsIn(items, W)[0]);
    expect(areas.map((a) => a.thing.name)).toEqual(["Aver valley", "Zweibrücken"]);
    expect(areas.every((a) => a.by === "group")).toBe(true);
    // Zweibrücken: its two halves are pinned, the town itself isn't.
    expect(areas.find((a) => a.thing.name === "Zweibrücken")!.outline).toHaveLength(2);
  });
});
