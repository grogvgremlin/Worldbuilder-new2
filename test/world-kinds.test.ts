// World: kinds and their flavours (owner, 26 Nov: City and Fortress as flavours of Place inherit its
// fields; whatever expects Place accepts them, even added later).
import { describe, expect, it } from "vitest";
import type { Item, ThingKind } from "../src/items/items";
import { newWorld, thingKindsIn } from "../src/world/world";
import { fieldsOffered, fitsExpected, fitsTree, flavoursOf, hasKind, kindLine, kindTree, misfit, setFlavourOf } from "../src/world/kinds";
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

  it("the starter's in takes places at both ends", () => {
    const { items, tree, place } = setUp();
    expect(items.find((i) => i.key === tree)).toMatchObject({ expectsFrom: [place], expectsTo: [place] });
  });

  it("a person can't go in a place, nor a place in a person; a city (a flavour of Place) can", () => {
    const { items } = setUp();
    expect(setParent(items, W, `${W}.thing.bob`, `${W}.thing.hills`).problem).toMatch(/takes Place inside; Bob isn't one/);
    expect(setParent(items, W, `${W}.thing.hills`, `${W}.thing.bob`).problem).toMatch(/as the container; Bob isn't one/);
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
    expect(addToGroup(items, W, `${W}.thing.bob`, group, `${W}.thing.hills`).problem).toMatch(/Bob isn't one/);
    expect(misfit(items, W, group, "from", `${W}.thing.town`)).toBeNull();
  });
});
