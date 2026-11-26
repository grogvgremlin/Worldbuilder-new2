// World: places, containment and pins (design/world-structure.md §3–5).
import { describe, expect, it } from "vitest";
import type { Item, Thing, WorldMap } from "../src/items/items";
import { Item as ItemSchema } from "../src/items/items";
import { linksIn, mapsIn, newKey, newWorld, removeThing, removeThingKind, thingsIn, worldOf } from "../src/world/world";
import { childrenOf, firstTree, hiddenIn, hideHere, isContainer, looseIn, looseItems, parentOf, pathOf, setParent, topPlaces, treeKinds, treeWarnings } from "../src/world/places";
import { areasOn, convexHull, notOnMap, placePin, removePin, sheetOf } from "../src/world/maps";

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
    expect(childrenOf(items, "averland-borders", key(items, "Averland")).map((t) => t.name)).toEqual(["Averheim", "Grenzstadt", "Heideck", "Kleindorf", "Streissen", "Zweibrücken (east bank)"]);
    // The tree's own top includes the sample's two groups (the screen lists those under Groups).
    expect(topPlaces(items, "averland-borders").map((t) => t.name)).toEqual(["Aver valley", "The Empire", "Zweibrücken"]);
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

  it("pins, moves and unpins, anywhere: the sheet grows to hold them", () => {
    const items = sample();
    let map: WorldMap = mapOf(items);
    const wissenland = key(items, "Wissenland");
    expect(notOnMap(items, map).map((t) => t.name)).toContain("Wissenland");
    map = placePin(map, wissenland, 250.4, 1200);
    expect(map.pins.find((p) => p.thing === wissenland)).toEqual({ thing: wissenland, x: 250, y: 1200 }); // the sheet grows
    expect(sheetOf(map).height).toBe(1280);
    map = placePin(map, wissenland, 10, 10);
    expect(map.pins.filter((p) => p.thing === wissenland)).toHaveLength(1);
    expect(removePin(map, wissenland).pins.some((p) => p.thing === wissenland)).toBe(false);
  });

  it("a place holding pinned places is an area around them, deeper ones after", () => {
    const items = sample();
    const areas = areasOn(items, mapOf(items));
    expect(areas.map((a) => a.thing.name)).toEqual(["The Empire", "Averland", "Stirland", "Wissenland"]);
    const averland = areas.find((a) => a.thing.name === "Averland")!.outline;
    expect(averland).toHaveLength(5); // Averheim sits inside the others
    expect(averland).not.toContainEqual({ x: 640, y: 330 });
  });

  it("the hull keeps only the outside points", () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }])).toHaveLength(4);
  });
});

describe("several trees (owner, 25 Nov: by province, by terrain …)", () => {
  const W = "averland-borders";
  const withTerrain = () => {
    const items = sample();
    const terrain: Item = { key: `${W}.link-kind.in-terrain`, kind: "link-kind", world: W, name: "in terrain", direction: "one-way", hierarchy: "one parent" };
    const hills: Item = { key: `${W}.thing.hill-country`, kind: "thing", world: W, name: "Hill country", kinds: [], fields: [] };
    return { items: [...items, terrain, hills], tree: terrain.key, hills: hills.key };
  };

  it("an item has a parent in each tree, apart", () => {
    const { items, tree, hills } = withTerrain();
    const heideck = key(items, "Heideck");
    const after = setParent(items, W, heideck, hills, tree).items;
    expect(parentOf(after, W, heideck, tree)).toBe(hills);
    expect(parentOf(after, W, heideck)).toBe(key(items, "Averland")); // the main tree is untouched
    expect(pathOf(after, W, heideck, tree).map((t) => t.name)).toEqual(["Hill country", "Heideck"]);
  });

  it("the world's trees: one-parent link kinds, the main one first", () => {
    const { items } = withTerrain();
    expect(treeKinds(items, W).map((k) => k.name)).toEqual(["in", "in terrain"]);
  });

  it("an item holding something by any tree or group is a container; the rest are base items", () => {
    const { items, tree, hills } = withTerrain();
    const after = setParent(items, W, key(items, "Heideck"), hills, tree).items;
    expect(isContainer(after, W, hills)).toBe(true); // by terrain
    expect(isContainer(after, W, key(items, "Averland"))).toBe(true); // by province
    expect(isContainer(after, W, key(items, "Zweibrücken"))).toBe(true); // a group
    expect(isContainer(after, W, key(items, "Heideck"))).toBe(false);
  });

  it("map areas follow the tree chosen", () => {
    const { items, tree, hills } = withTerrain();
    let after = setParent(items, W, key(items, "Heideck"), hills, tree).items;
    after = setParent(after, W, key(items, "Kleindorf"), hills, tree).items;
    const map = mapsIn(after, W)[0];
    expect(areasOn(after, map, tree).map((a) => a.thing.name)).toEqual(["Hill country"]);
  });
});

describe("loose items (owner, 26 Nov)", () => {
  it("an item in no tree and no group is loose; one that holds something isn't", () => {
    const items = sample();
    const W = "averland-borders";
    const drifter: Item = { key: `${W}.thing.drifter`, kind: "thing", world: W, name: "Drifter", kinds: [], fields: [] };
    expect(looseItems([...items, drifter], W).map((t) => t.name)).toEqual(["Drifter"]);
  });
});

describe("loose items in a tree, shown or hidden (owner, 26 Nov)", () => {
  const W = "averland-borders";
  it("hidden all, or chosen ones; an item holding something is never hidden", () => {
    const items = sample();
    const place = items.find((i) => i.kind === "thing-kind")!.key;
    const drifter: Item = { key: `${W}.thing.drifter`, kind: "thing", world: W, name: "Drifter", kinds: [place], fields: [] };
    const withDrifter = [...items, drifter];
    const tree = treeKinds(withDrifter, W)[0].key;
    expect(firstTree(withDrifter, W)).toBe(tree);
    expect(looseIn(withDrifter, W).map((t) => t.name)).toContain("Drifter");
    const hidden = hideHere(withDrifter, tree, drifter.key, true);
    expect(topPlaces(hidden, W).map((t) => t.name)).not.toContain("Drifter");
    expect(topPlaces(hideHere(hidden, tree, drifter.key, false), W).map((t) => t.name)).toContain("Drifter");
    const all = withDrifter.map((i) => (i.key === tree ? { ...i, loose: "hide" as const } : i));
    expect(topPlaces(all, W).map((t) => t.name)).toEqual(["The Empire"]); // the empire holds things: still shown
  });
});

describe("why an item is hidden from a tree (owner, 26 Nov)", () => {
  it("by hand, or because the tree hides loose items; never once it's linked there", () => {
    const W = "averland-borders";
    const items = sample();
    const place = items.find((i) => i.kind === "thing-kind")!.key;
    const drifter: Item = { key: `${W}.thing.drifter`, kind: "thing", world: W, name: "Drifter", kinds: [place], fields: [] };
    const tree = treeKinds(items, W)[0].key;
    let all = hideHere([...items, drifter], tree, drifter.key, true);
    expect(hiddenIn(all, W, tree, drifter.key)).toBe("by hand");
    all = setParent(all, W, drifter.key, key(all, "Averland")).items;
    expect(hiddenIn(all, W, tree, drifter.key)).toBeNull();
  });
});
