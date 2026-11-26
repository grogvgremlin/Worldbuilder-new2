// World: acting on a selection (owner, 26 Nov): group, new group, move into; suggestions first.
import { describe, expect, it } from "vitest";
import type { Item, Thing } from "../src/items/items";
import { newWorld } from "../src/world/world";
import { groupSelected, moveSelectedInto, newGroupOf, suggestions } from "../src/world/bulk";
import { groupsOf, membersOf } from "../src/world/groups";
import { parentOf } from "../src/world/places";

const W = "averland-borders";
const sample = () => newWorld([], "Averland borders", "sample");
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;

describe("acting on a selection", () => {
  it("a new group of the selected items", () => {
    const items = sample();
    const picked = [key(items, "Nuln"), key(items, "Heideck")];
    const result = newGroupOf(items, W, picked, "Gun route");
    expect(result.done).toBe(2);
    expect(membersOf(result.items, W, result.group!).map((m) => m.thing.name)).toEqual(["Heideck", "Nuln"]);
  });

  it("into an existing group; the group itself, if selected, is skipped", () => {
    const items = sample();
    const valley = key(items, "Aver valley");
    const result = groupSelected(items, W, [valley, key(items, "Heideck")], valley);
    expect(result.done).toBe(1);
    expect(groupsOf(result.items, W, key(items, "Heideck")).map((g) => g.thing.name)).toEqual(["Aver valley"]);
  });

  it("move into a container; what can't go says why", () => {
    const items = sample();
    const stirland = key(items, "Stirland");
    const result = moveSelectedInto(items, W, [key(items, "Heideck"), key(items, "The Empire")], stirland);
    expect(result.done).toBe(1);
    expect(parentOf(result.items, W, key(items, "Heideck"))).toBe(stirland);
    expect(result.problems[0]).toMatch(/The Empire: that item is inside this one already/);
  });

  it("suggests selected groups and containers first", () => {
    const items = sample();
    const s = suggestions(items, W, [key(items, "Aver valley"), key(items, "Averland"), key(items, "Nuln")]);
    expect(s.groups.map((t) => t.name)).toEqual(["Aver valley"]);
    expect(s.containers.map((t) => t.name)).toEqual(["Averland"]);
  });
});
