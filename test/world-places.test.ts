// World: places, containment and pins (design/world-structure.md §3–5).
import { describe, expect, it } from "vitest";
import type { Item, Thing, WorldMap } from "../src/items/items";
import { Item as ItemSchema } from "../src/items/items";
import { linksIn, mapsIn, newKey, newWorld, removeThing, removeThingKind, thingsIn, worldOf } from "../src/world/world";
import { childrenOf, parentOf, pathOf, setParent, topPlaces, treeWarnings } from "../src/world/places";
import { areasOn, convexHull, notOnMap, placePin, removePin } from "../src/world/maps";

const sample = () => newWorld([], "Averland borders", "sample");
const key = (items: Item[], name: string) => (items.find((i) => i.kind === "thing" && i.name === name) as Thing).key;

describe("making a world", () => {
  it("a blank world is only the world", () => {
    const made = newWorld([], "Empty", "blank");
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ kind: "sandbox", world: true, name: "Empty" });
  });

  it("the starter brings kinds and the containment link kind, set as the tree", () => {
    const made = newWorld([], "Mine", "starter");
    const world = worldOf(made, "mine")!;
    expect(made.filter((i) => i.kind === "thing-kind").map((i) => i.name)).toEqual(["Place"]); // one generic kind (owner, 25 Nov)
    expect(made.find((i) => i.key === world.tree)).toMatchObject({ kind: "link-kind", name: "in", hierarchy: "one parent" });
  });

  it("every item made reads back through its schema", () => {
    for (const item of sample()) expect(ItemSchema.safeParse(item).success).toBe(true);
  });

  it("two worlds of the same name get different keys", () => {
    const first = newWorld([], "Mine", "blank");
    const second = newWorld(first, "Mine", "blank");
    expect(second[0].key).toBe("mine-2");
  });

  it("keys read world.kind.name and never collide", () => {
    const items = sample();
    expect(key(items, "Averheim")).toBe("averland-borders.thing.averheim");
    expect(newKey(items, "averland-borders", "thing", "Averheim")).toBe("averland-borders.thing.averheim-2");
  });
});

describe("containment", () => {
  it("paths run from the top down", () => {
    const items = sample();
    expect(pathOf(items, "averland-borders", key(items, "Averheim")).map((t) => t.name)).toEqual(["The Empire", "Averland", "Averheim"]);
  });

  it("children and the top of the tree", () => {
    const items = sample();
    expect(childrenOf(items, "averland-borders", key(items, "Averland")).map((t) => t.name)).toEqual(["Averheim", "Grenzstadt", "Heideck", "Kleindorf", "Streissen"]);
    expect(topPlaces(items, "averland-borders").map((t) => t.name)).toEqual(["The Empire"]);
  });

  it("moving a place replaces its parent (one at a time)", () => {
    const items = sample();
    const grenzstadt = key(items, "Grenzstadt");
    const moved = setParent(items, "averland-borders", grenzstadt, key(items, "Stirland"));
    expect(moved.problem).toBeUndefined();
    expect(parentOf(moved.items, "averland-borders", grenzstadt)).toBe(key(items, "Stirland"));
    expect(linksIn(moved.items, "averland-borders").filter((l) => l.from === grenzstadt)).toHaveLength(1);
  });

  it("a loop is refused", () => {
    const items = sample();
    const result = setParent(items, "averland-borders", key(items, "Averland"), key(items, "Averheim"));
    expect(result.problem).toMatch(/inside this one/);
    expect(result.items).toBe(items);
  });

  it("two parents at once (from an upload) is a warning", () => {
    const items = sample();
    const world = worldOf(items, "averland-borders")!;
    const extra: Item = { key: "x", kind: "link", world: world.key, name: "", from: key(items, "Nuln"), linkKind: world.tree!, to: key(items, "Averland") };
    expect(treeWarnings([...items, extra], world.key)).toEqual(["Nuln is in Wissenland and Averland at once"]);
  });

  it("removing a place takes its links and pins, and leaves what it held at the top", () => {
    const items = sample();
    const after = removeThing(items, key(items, "Averland"));
    expect(thingsIn(after, "averland-borders").some((t) => t.name === "Averland")).toBe(false);
    expect(topPlaces(after, "averland-borders").map((t) => t.name)).toContain("Averheim");
  });

  it("removing a kind turns its fields into one-offs", () => {
    const items = sample();
    const place = items.find((i) => i.kind === "thing-kind" && i.name === "Place")!.key;
    const withKindField = items.map((i) => (i.key === key(items, "Averheim") ? { ...(i as Thing), fields: [{ of: place, field: "size", value: "city" }] } : i));
    const after = removeThingKind(withKindField, place);
    const averheim = after.find((i) => i.key === key(items, "Averheim")) as Thing;
    expect(averheim.kinds).toEqual([]);
    expect(averheim.fields).toEqual([{ field: "size", value: "city" }]);
  });

  it("the sample's details are the places' own fields", () => {
    const items = sample();
    expect((items.find((i) => i.key === key(items, "Averheim")) as Thing).fields).toEqual([{ field: "size", value: "city" }]);
  });
});

describe("maps", () => {
  const mapOf = (items: Item[]) => mapsIn(items, "averland-borders")[0];

  it("pins, moves and unpins, kept inside the map", () => {
    const items = sample();
    let map: WorldMap = mapOf(items);
    const wissenland = key(items, "Wissenland");
    expect(notOnMap(items, map).map((t) => t.name)).toContain("Wissenland");
    map = placePin(map, wissenland, 250.4, 9999);
    expect(map.pins.find((p) => p.thing === wissenland)).toEqual({ thing: wissenland, x: 250, y: 700 });
    map = placePin(map, wissenland, 10, 10);
    expect(map.pins.filter((p) => p.thing === wissenland)).toHaveLength(1);
    expect(removePin(map, wissenland).pins.some((p) => p.thing === wissenland)).toBe(false);
  });

  it("a place holding pinned places is an area around them, deeper ones after", () => {
    const items = sample();
    const areas = areasOn(items, mapOf(items));
    expect(areas.map((a) => a.thing.name)).toEqual(["The Empire", "Averland", "Stirland", "Wissenland"]);
    const averland = areas.find((a) => a.thing.name === "Averland")!.outline;
    expect(averland).toHaveLength(4); // Averheim sits inside the other four towns
    expect(averland).not.toContainEqual({ x: 640, y: 330 });
  });

  it("the hull keeps only the outside points", () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }])).toHaveLength(4);
  });
});
