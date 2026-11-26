// World: kinds and their flavours (owner, 26 Nov: City and Fortress as flavours of Place inherit its
// fields; whatever expects Place accepts them, even added later).
import { describe, expect, it } from "vitest";
import type { Item, LinkKind, ThingKind } from "../src/items/items";
import { newWorld, thingKindsIn, worldOf } from "../src/world/world";
import { cloneLinkKind, fieldsOffered, fitsExpected, fitsTree, flavoursOf, hasKind, inOrder, kindLine, kindTree, linkMisfits, misfit, moveInOrder, removeLinkKind, setFlavourOf } from "../src/world/kinds";
import { setParent, topPlaces } from "../src/world/places";
import { addToGroup } from "../src/world/groups";

const W = "mine";
function withFlavours() {
  const items: Item[] = newWorld([], "Mine", "starter");
  const place = thingKindsIn(items, W)[0];
  const withField = items.map((i) => (i.key === place.key ? { ...(i as ThingKind), fields: [{ name: "population" }] } : i));
  const city: ThingKind = { key: `${W}.kind.city`, kind: "thing-kind", world: W, name: "City", flavourOf: place.key, fields: [{ name: "walls" }] };
  const free: ThingKind = { key: `${W}.kind.free-city`, kind: "thing-kind", world: W, name: "Free city", flavourOf: city.key, fields: [] };
  const person: ThingKind = { key: `${W}.kind.person`, kind: "thing-kind", world: W, name: "Person", fields: [] };
  return { items: [...withField, city, free, person], place: place.key, city: city.key, free: free.key, person: person.key };
}

describe("flavours of kind", () => {
  it("a flavour's line runs up to its root kind", () => {
    const { items, free } = withFlavours();
    expect(kindLine(items, W, free).map((k) => k.name)).toEqual(["Free city", "City", "Place"]);
  });

  it("a flavour offers its parents' fields too, named under the parent", () => {
    const { items, free, place, city } = withFlavours();
    expect(fieldsOffered(items, W, free).map((f) => [f.of, f.field.name, f.inherited])).toEqual([
      [place, "population", true],
      [city, "walls", true],
    ]);
  });

  it("whatever expects Place accepts its flavours, even ones added later", () => {
    const { items, place, free, person } = withFlavours();
    expect(hasKind(items, W, [free], place)).toBe(true);
    expect(fitsExpected(items, W, [free], [place])).toBe(true);
    expect(fitsExpected(items, W, [person], [place])).toBe(false);
    expect(fitsExpected(items, W, [person], undefined)).toBe(true);
    const fort: ThingKind = { key: `${W}.kind.fortress`, kind: "thing-kind", world: W, name: "Fortress", flavourOf: place, fields: [] };
    expect(fitsExpected([...items, fort], W, [fort.key], [place])).toBe(true);
  });

  it("a loop is refused", () => {
    const { items, place, free } = withFlavours();
    expect(setFlavourOf(items, W, place, free).problem).toMatch(/already a flavour/);
    expect(setFlavourOf(items, W, place, place).problem).toMatch(/itself/);
  });

  it("kinds listed as a tree; flavours found at any depth", () => {
    const { items, place } = withFlavours();
    expect(kindTree(items, W).map((k) => `${"-".repeat(k.depth)}${k.kind.name}`)).toEqual(["Person", "Place", "-City", "--Free city"]);
    expect(flavoursOf(items, W, place).map((k) => k.name).sort()).toEqual(["City", "Free city"]);
  });
});

describe("what a tree or group takes (owner, 26 Nov: places can't hold people)", () => {
  const setUp = () => {
    const made = withFlavours();
    const tree = made.items.find((i) => i.kind === "link-kind" && i.name === "in")!.key;
    const town: Item = { key: `${W}.thing.town`, kind: "thing", world: W, name: "Town", kinds: [made.city], fields: [] };
    const hills: Item = { key: `${W}.thing.hills`, kind: "thing", world: W, name: "Hills", kinds: [made.place], fields: [] };
    const bob: Item = { key: `${W}.thing.bob`, kind: "thing", world: W, name: "Bob", kinds: [made.person], fields: [] };
    return { ...made, tree, items: [...made.items, town, hills, bob] };
  };

  it("the starter's in takes places, the same at both ends", () => {
    const { items, tree, place } = setUp();
    expect(items.find((i) => i.key === tree)).toMatchObject({ scope: [place] });
  });

  it("a person can't go in a place, nor a place in a person; a city (a flavour of Place) can", () => {
    const { items } = setUp();
    expect(setParent(items, W, `${W}.thing.bob`, `${W}.thing.hills`).problem).toMatch(/takes Place inside; Bob doesn't fit/);
    expect(setParent(items, W, `${W}.thing.hills`, `${W}.thing.bob`).problem).toMatch(/as the container; Bob doesn't fit/);
    expect(setParent(items, W, `${W}.thing.town`, `${W}.thing.hills`).problem).toBeUndefined();
  });

  it("a tree leaves out what doesn't belong in it", () => {
    const { items, tree } = setUp();
    expect(fitsTree(items, W, tree, `${W}.thing.bob`)).toBe(false);
    expect(topPlaces(items, W).map((t) => t.name)).toEqual(["Hills", "Town"]);
  });

  it("groups follow their link kind's Expects too", () => {
    const { items } = setUp();
    const group = items.find((i) => i.kind === "link-kind" && i.name === "in area")!.key;
    expect(addToGroup(items, W, `${W}.thing.bob`, group, `${W}.thing.hills`).problem).toMatch(/Bob doesn't fit/);
    expect(misfit(items, W, group, "from", `${W}.thing.town`)).toBeNull();
  });
});

describe("what a link kind takes: scope, exclude, warn (owner, 26 Nov)", () => {
  const setUp = (rule: Partial<LinkKind>) => {
    const made = withFlavours();
    const road: LinkKind = { key: `${W}.link-kind.road`, kind: "link-kind", world: W, name: "road", direction: "both ways", hierarchy: "one parent", ...rule };
    const fort: ThingKind = { key: `${W}.kind.fortress`, kind: "thing-kind", world: W, name: "Fortress", flavourOf: made.place, fields: [] };
    const thing = (name: string, kind: string): Item => ({ key: `${W}.thing.${name}`, kind: "thing", world: W, name, kinds: [kind], fields: [] });
    const items = [...made.items, road, fort, thing("town", made.city), thing("keep", fort.key), thing("bob", made.person), thing("hills", made.place)];
    return { ...made, items, road: road.key, fort: fort.key };
  };
  const place = `${W}.kind.place`, city = `${W}.kind.city`, fort = `${W}.kind.fortress`;
  const fits = (items: Item[], road: string, name: string) => misfit(items, W, road, "from", `${W}.thing.${name}`) === null;

  it("a scope covers both ends", () => {
    const { items, road } = setUp({ scope: [place] });
    expect(fits(items, road, "town")).toBe(true);
    expect(fits(items, road, "bob")).toBe(false);
    expect(misfit(items, W, road, "to", `${W}.thing.bob`)).not.toBeNull();
  });

  it("take Place but exclude Fortress: every place but fortresses", () => {
    const { items, road } = setUp({ scope: [place], exclude: [fort] });
    expect(fits(items, road, "hills")).toBe(true);
    expect(fits(items, road, "keep")).toBe(false);
  });

  it("exclude Place takes its flavours out too, unless one is put back", () => {
    const { items, road } = setUp({ exclude: [place] });
    expect(fits(items, road, "town")).toBe(false);
    expect(fits(items, road, "bob")).toBe(true); // nothing listed to take: all but the excluded
    const back = setUp({ exclude: [place], scope: [city] });
    expect(fits(back.items, back.road, "town")).toBe(true);
    expect(fits(back.items, back.road, "hills")).toBe(false);
  });

  it("warn only: a misfit is allowed and flagged", () => {
    const { items, road } = setUp({ scope: [place], strictness: "warn" });
    const moved = setParent(items, W, `${W}.thing.bob`, `${W}.thing.hills`, road);
    expect(moved.problem).toBeUndefined();
    expect(linkMisfits(moved.items, W)).toEqual([`"road" takes Place inside; bob doesn't fit`]);
    expect(fitsTree(items, W, road, `${W}.thing.bob`)).toBe(true); // a warn-only tree shows everything
  });

  it("strict: refused", () => {
    const { items, road } = setUp({ scope: [place] });
    expect(setParent(items, W, `${W}.thing.bob`, `${W}.thing.hills`, road).problem).toMatch(/doesn't fit/);
  });
});

describe("link kinds: order, copy, remove (owner, 26 Nov)", () => {
  it("kinds listed in the world's order, moved with arrows", () => {
    const { items } = withFlavours();
    const kinds = thingKindsIn(items, W);
    const person = kinds.find((k) => k.name === "Person")!.key;
    const before = inOrder(items, W, kinds).map((k) => k.name);
    expect(before[0]).toBe("City");
    const moved = moveInOrder(items, W, kinds, person, -1);
    const after = inOrder(moved, W, kinds).map((k) => k.name);
    expect(after.indexOf("Person")).toBe(before.indexOf("Person") - 1);
  });

  it("a copy takes the settings under a new name, not the links", () => {
    const { items } = withFlavours();
    const tree = items.find((i) => i.kind === "link-kind" && i.name === "in")!;
    const copy = cloneLinkKind(items, W, tree.key, "in (terrain)");
    expect(copy.problem).toBeUndefined();
    expect(copy.items.find((i) => i.key === copy.key)).toMatchObject({ name: "in (terrain)", hierarchy: "one parent" });
    expect(cloneLinkKind(items, W, tree.key, "IN").problem).toMatch(/already/);
  });

  it("removing a link kind takes its links; the main tree goes with it", () => {
    const { items, place } = withFlavours();
    const tree = worldOf(items, W)!.tree!;
    const a: Item = { key: `${W}.thing.a`, kind: "thing", world: W, name: "A", kinds: [place], fields: [] };
    const b: Item = { key: `${W}.thing.b`, kind: "thing", world: W, name: "B", kinds: [place], fields: [] };
    const linked = setParent([...items, a, b], W, a.key, b.key).items;
    const after = removeLinkKind(linked, W, tree);
    expect(after.some((i) => i.kind === "link")).toBe(false);
    expect(worldOf(after, W)!.tree).toBeUndefined();
  });
});

describe("one list for both ends, or a list per end (owner, 26 Nov)", () => {
  it("switching carries the kinds across, and only one applies", async () => {
    const { setEndsDiffer, endRule } = await import("../src/world/kinds");
    const base: LinkKind = { key: "k", kind: "link-kind", world: W, name: "rules", direction: "one-way", hierarchy: "none", scope: ["a"] };
    const differ = setEndsDiffer(base, true);
    expect(differ).toMatchObject({ endsDiffer: true, expectsFrom: ["a"], expectsTo: ["a"] });
    expect(differ.scope).toBeUndefined();
    const changed = { ...differ, expectsTo: ["b"] };
    expect(endRule(changed, "to").take).toEqual(["b"]);
    const same = setEndsDiffer(changed, false);
    expect(same).toMatchObject({ scope: ["a"] });
    expect(endRule(same, "to").take).toEqual(["a"]);
  });
});
