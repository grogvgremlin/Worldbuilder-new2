// World: link containers (owner, 27 Nov): a world item made of links (e.g. a road). Along it:
// its items in order, where it meets other roads, gaps flagged as pieces, read from a chosen start.
// A link kind can say what its links can be part of. A link can be split at an item.
// Design: design/world-structure.md §3–4 (segments, points, part of; crossings and interchanges).
import { describe, expect, it } from "vitest";
import type { Item, LinkKind, Thing, WorldMap } from "../src/items/items";
import { linkKindsIn, newWorld, thingKindsIn } from "../src/world/world";
import { alongLinks, join, linkOf, partOfMisfit, setPartOf, splitLink } from "../src/world/links";
import { isContainer } from "../src/world/places";

const W = "mine";
const key = (name: string) => `${W}.thing.${name}`;

function world() {
  const start = newWorld([], "Mine", "starter");
  const place = thingKindsIn(start, W)[0].key;
  const roadKind = { key: `${W}.kind.road`, kind: "thing-kind" as const, world: W, name: "Road", fields: [] };
  const thing = (name: string, kinds = [place]): Thing => ({ key: key(name), kind: "thing", world: W, name, kinds, fields: [] });
  let items: Item[] = [...start, roadKind, ...["altdorf", "delberz", "crossroads", "middenheim", "grunburg", "talabheim", "far-a", "far-b"].map((n) => thing(n)), thing("north", [roadKind.key]), thing("forest", [roadKind.key])];
  const road = linkKindsIn(items, W).find((k) => k.name === "adjacent to")!.key;
  const links: Record<string, string> = {};
  const add = (a: string, b: string, whole: string) => {
    const made = join(items, W, key(a), road, key(b));
    items = setPartOf(made.items, made.link!, key(whole)).items;
    links[`${a}-${b}`] = made.link!;
  };
  add("delberz", "crossroads", "north");
  add("altdorf", "delberz", "north");
  add("crossroads", "middenheim", "north");
  add("grunburg", "crossroads", "forest");
  add("crossroads", "talabheim", "forest");
  return { items, road, links, roadKind: roadKind.key };
}

const names = (items: Item[], keys: string[]) => keys.map((k) => items.find((i) => i.key === k)!.name);

describe("along a road", () => {
  it("lists its items in order, from an end", () => {
    const { items } = world();
    const along = alongLinks(items, W, key("north"));
    expect(along.pieces).toHaveLength(1);
    expect(names(items, along.pieces[0].runs[0].points)).toEqual(["altdorf", "delberz", "crossroads", "middenheim"]);
  });

  it("reads from the chosen start", () => {
    const { items } = world();
    const fromMiddenheim = items.map((i) => (i.key === key("north") ? { ...(i as Thing), startsAt: key("middenheim") } : i));
    expect(names(items, alongLinks(fromMiddenheim, W, key("north")).pieces[0].runs[0].points)).toEqual(["middenheim", "crossroads", "delberz", "altdorf"]);
  });

  it("says where it meets other roads", () => {
    const { items } = world();
    const meets = alongLinks(items, W, key("north")).meets;
    expect([...meets.keys()]).toEqual([key("crossroads")]);
    expect(meets.get(key("crossroads"))!.map((t) => t.name)).toEqual(["forest"]);
  });

  it("a gap makes two pieces (flagged, not refused)", () => {
    const { items, road } = world();
    const made = join(items, W, key("far-a"), road, key("far-b"));
    const gapped = setPartOf(made.items, made.link!, key("north")).items;
    expect(alongLinks(gapped, W, key("north")).pieces).toHaveLength(2);
  });

  it("a road with stretches is a container", () => {
    const { items } = world();
    expect(isContainer(items, W, key("north"))).toBe(true);
  });
});

describe("what a link can be part of", () => {
  it("is limited by its link kind: strict refuses, warn flags", () => {
    const { items, road, roadKind, links } = world();
    const limited = items.map((i) => (i.key === road ? { ...(i as LinkKind), partOfTakes: [roadKind] } : i));
    expect(partOfMisfit(limited, W, links["altdorf-delberz"], key("north"))).toBeNull();
    expect(setPartOf(limited, links["altdorf-delberz"], key("talabheim")).problem).toMatch(/can be part of Road; talabheim isn't/);
    const warn = limited.map((i) => (i.key === road ? { ...(i as LinkKind), strictness: "warn" as const } : i));
    expect(setPartOf(warn, links["altdorf-delberz"], key("talabheim")).problem).toBeUndefined();
  });
});

describe("splitting a link", () => {
  it("makes two stretches through the item, both keeping the road and fields; the first keeps its key", () => {
    const { items, links } = world();
    const inn: Thing = { key: key("inn"), kind: "thing", world: W, name: "inn", kinds: items.find((i) => i.key === key("altdorf"))!.kind === "thing" ? (items.find((i) => i.key === key("altdorf")) as Thing).kinds : [], fields: [] };
    const withFields = items.map((i) => (i.key === links["altdorf-delberz"] ? { ...i, fields: [{ field: "distance", value: "60" }] } : i)) as Item[];
    const split = splitLink([...withFields, inn], W, links["altdorf-delberz"], key("inn"));
    expect(split.problem).toBeUndefined();
    const first = linkOf(split.items, links["altdorf-delberz"])!;
    const second = linkOf(split.items, split.second!)!;
    expect([first.from, first.to, second.from, second.to]).toEqual([key("altdorf"), key("inn"), key("inn"), key("delberz")]);
    expect([first.partOf, second.partOf, second.fields]).toEqual([key("north"), key("north"), [{ field: "distance", value: "60" }]]);
    expect(names(split.items, alongLinks(split.items, W, key("north")).pieces[0].runs[0].points)).toEqual(["altdorf", "inn", "delberz", "crossroads", "middenheim"]);
  });

  it("pins the item halfway on a map with both ends pinned", () => {
    const { items, links } = world();
    const map: WorldMap = { key: `${W}.map.m`, kind: "map", world: W, name: "m", width: 100, height: 100, pins: [{ thing: key("altdorf"), x: 0, y: 0 }, { thing: key("delberz"), x: 100, y: 50 }] };
    const inn: Thing = { ...(items.find((i) => i.key === key("altdorf")) as Thing), key: key("inn"), name: "inn" };
    const split = splitLink([...items, inn, map], W, links["altdorf-delberz"], key("inn"));
    expect((split.items.find((i) => i.key === map.key) as WorldMap).pins.find((p) => p.thing === key("inn"))).toMatchObject({ x: 50, y: 25 });
  });

  it("refuses an end, or an item a strict link kind doesn't take", () => {
    const { items, links } = world();
    expect(splitLink(items, W, links["altdorf-delberz"], key("delberz")).problem).toMatch(/an end of this link already/);
    expect(splitLink(items, W, links["altdorf-delberz"], key("north")).problem).toMatch(/doesn't fit/);
  });
});
