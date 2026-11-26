// World: groups that bring what a member holds (owner, 26 Nov): a container's contents in one tree,
// or a group's members; worked out each time; exclusions; the tree said when it's ambiguous.
import { describe, expect, it } from "vitest";
import type { Item, Thing } from "../src/items/items";
import { newWorld, worldOf } from "../src/world/world";
import { addToGroup, broughtOptions, effectiveMembers, excludeFromGroup, groupLinkKinds, groupsWithMember } from "../src/world/groups";
import { setParent, treeKinds } from "../src/world/places";
import { newGroupOf } from "../src/world/bulk";

const W = "averland-borders";
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;
const names = (list: { thing: Thing }[]) => list.map((m) => m.thing.name);

function setUp() {
  const items = newWorld([], "Averland borders", "sample");
  const tree = worldOf(items, W)!.tree!;
  const place = items.find((i) => i.kind === "thing-kind")!.key;
  const group: Item = { key: `${W}.thing.powerhouse`, kind: "thing", world: W, name: "Powerhouse", kinds: [place], fields: [] };
  return { items: [...items, group], tree, group: group.key, inArea: groupLinkKinds(items, W)[0].key };
}

describe("scoped groups", () => {
  it("a container brings its contents in the tree chosen, and later additions follow", () => {
    const { items, tree, group, inArea } = setUp();
    let all = addToGroup(items, W, key(items, "Wissenland"), inArea, group, { brings: "contents", tree }).items;
    expect(names(effectiveMembers(all, W, group))).toEqual(["Nuln", "Wissenland", "Zweibrücken (west bank)"]);
    all = setParent(all, W, key(items, "Heideck"), key(items, "Wissenland")).items; // added later
    expect(names(effectiveMembers(all, W, group))).toContain("Heideck");
    expect(effectiveMembers(all, W, group).find((m) => m.thing.name === "Heideck")!.via!.name).toBe("Wissenland");
  });

  it("a group brings its members, including those it brings itself", () => {
    const { items, tree, group, inArea } = setUp();
    let all = addToGroup(items, W, key(items, "Zweibrücken"), inArea, group, { brings: "members" }).items;
    expect(names(effectiveMembers(all, W, group))).toEqual(["Zweibrücken", "Zweibrücken (east bank)", "Zweibrücken (west bank)"]);
    all = addToGroup(all, W, key(items, "Kleindorf"), inArea, group).items; // alone
    expect(names(effectiveMembers(all, W, group))).toContain("Kleindorf");
    void tree;
  });

  it("an item brought in can be left out, and put back", () => {
    const { items, tree, group, inArea } = setUp();
    let all = addToGroup(items, W, key(items, "Wissenland"), inArea, group, { brings: "contents", tree }).items;
    all = excludeFromGroup(all, group, key(items, "Nuln"), true);
    expect(names(effectiveMembers(all, W, group))).not.toContain("Nuln");
    expect(groupsWithMember(all, W, key(items, "Nuln")).map((g) => g.group.name)).toEqual(["Aver valley"]);
    all = excludeFromGroup(all, group, key(items, "Nuln"), false);
    expect(groupsWithMember(all, W, key(items, "Nuln")).map((g) => [g.group.name, g.via?.name ?? null])).toEqual([["Aver valley", null], ["Powerhouse", "Wissenland"]]);
  });

  it("what a container could bring is listed per tree, so an ambiguous one is chosen", () => {
    const { items, tree } = setUp();
    const terrain: Item = { key: `${W}.link-kind.terrain`, kind: "link-kind", world: W, name: "in terrain", direction: "one-way", hierarchy: "one parent", strictness: "warn" };
    const all = setParent([...items, terrain], W, key(items, "Heideck"), key(items, "Averland"), terrain.key).items;
    const options = broughtOptions(all, W, key(items, "Averland"), treeKinds(all, W).map((k) => ({ key: k.key, name: k.name })));
    expect(options.map((o) => o.label)).toEqual([`with everything inside it in "in" (6)`, `with everything inside it in "in terrain" (1)`]);
    void tree;
  });

  it("a new group from a selection can bring contents", () => {
    const { items, tree } = setUp();
    const result = newGroupOf(items, W, [key(items, "Stirland"), key(items, "Kleindorf")], "North", undefined, new Map([[key(items, "Stirland"), { brings: "contents" as const, tree }]]));
    expect(names(effectiveMembers(result.items, W, result.group!))).toEqual(["Kleindorf", "Stirland", "Wurtbad"]);
  });
});
