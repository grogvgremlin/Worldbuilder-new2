// World: kinds and their flavours (owner, 26 Nov: City and Fortress as flavours of Place inherit its
// fields; whatever expects Place accepts them, even added later).
import { describe, expect, it } from "vitest";
import type { Item, ThingKind } from "../src/items/items";
import { newWorld, thingKindsIn } from "../src/world/world";
import { fieldsOffered, fitsExpected, flavoursOf, hasKind, kindLine, kindTree, setFlavourOf } from "../src/world/kinds";

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
