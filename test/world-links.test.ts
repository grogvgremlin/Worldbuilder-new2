// World: connections (owner, 26–27 Nov). Ends first: the link kinds that fit two items offered first,
// the rest with the reason; Strict misfits can't be picked, Warn-only ones can. Joining by a tree
// moves the item, by a group puts it in the group, by a plain link kind links them in the order picked.
// Design: design/world-structure.md §3; spec/authoring/authoring-v2.md §1.1.
import { describe, expect, it } from "vitest";
import type { Item, LinkKind, Thing, ThingKind } from "../src/items/items";
import { linkKindsIn, newWorld, thingKindsIn } from "../src/world/world";
import { fieldSummary, fieldsOfLink, linkValue, removeLinkField, setLinkValue } from "../src/world/links";
import { upgradeItems } from "../src/items/race-dimensions";
import { changeLink, changeLinkKind, join, linkOf, linksFrom, linkStyle, linkTitle, offersFor, removeLink, swapEnds } from "../src/world/links";
import { hiddenIn, hideHere, parentOf, setParent } from "../src/world/places";
import { misfitLinks } from "../src/world/kinds";

const W = "mine";
const key = (name: string) => `${W}.thing.${name}`;

function setUp() {
  const start = newWorld([], "Mine", "starter");
  const place = thingKindsIn(start, W)[0].key;
  const person: ThingKind = { key: `${W}.kind.person`, kind: "thing-kind", world: W, name: "Person", fields: [] };
  const thing = (name: string, kinds: string[]): Thing => ({ key: key(name), kind: "thing", world: W, name, kinds, fields: [] });
  const rules: LinkKind = { key: `${W}.link-kind.rules`, kind: "link-kind", world: W, name: "rules", reverseName: "ruled by", direction: "one-way", hierarchy: "none", endsDiffer: true, expectsFrom: [person.key], expectsTo: [place] };
  const feud: LinkKind = { key: `${W}.link-kind.feud`, kind: "link-kind", world: W, name: "feud with", direction: "both ways", hierarchy: "none", fields: [{ name: "strength" }] };
  const items: Item[] = [...start, person, rules, feud, thing("nuln", [place]), thing("averland", [place]), thing("countess", [person.key]), thing("count", [person.key])];
  const kinds = new Map(linkKindsIn(items, W).map((k) => [k.name, k.key]));
  return { items, kinds, place };
}

describe("offering link kinds for two items", () => {
  it("those whose ends fit come first; the rest say why", () => {
    const { items } = setUp();
    const offers = offersFor(items, W, key("countess"), key("nuln"));
    const first = offers.filter((o) => o.fits === "yes").map((o) => o.kind.name);
    expect(first).toContain("rules");
    expect(first).toContain("feud with");
    const inTree = offers.find((o) => o.kind.name === "in")!;
    expect(inTree.canPick).toBe(false); // strict: the countess isn't a place
    expect(inTree.why).toMatch(/takes Place inside; countess doesn't fit/);
    expect(offers.indexOf(inTree)).toBeGreaterThan(offers.findIndex((o) => o.kind.name === "rules"));
  });

  it("a one-way kind that fits only the other way round is offered reversed", () => {
    const { items } = setUp();
    const rules = offersFor(items, W, key("nuln"), key("countess")).find((o) => o.kind.name === "rules")!;
    expect(rules.fits).toBe("reversed");
    expect(rules.canPick).toBe(true);
  });

  it("a warn-only misfit can be picked, and is flagged once made", () => {
    const { items, kinds } = setUp();
    const loose = items.map((i) => (i.key === kinds.get("rules") ? { ...(i as LinkKind), strictness: "warn" as const } : i));
    const offer = offersFor(loose, W, key("averland"), key("nuln")).find((o) => o.kind.name === "rules")!;
    expect(offer.fits).toBe("no");
    expect(offer.canPick).toBe(true);
    const made = join(loose, W, key("averland"), kinds.get("rules")!, key("nuln"));
    expect(made.problem).toBeUndefined();
    expect(misfitLinks(made.items, W)).toHaveLength(1);
  });

  it("a tree says it will move the item; a loop is refused", () => {
    const { items, kinds } = setUp();
    const inside = setParent(items, W, key("nuln"), key("averland"), kinds.get("in")).items;
    const other = { ...(inside.find((i) => i.key === key("averland")) as Thing), key: key("wissenland"), name: "Wissenland" };
    const three = [...inside, other];
    expect(offersFor(three, W, key("nuln"), key("wissenland")).find((o) => o.kind.name === "in")!.note).toBe("moves nuln out of averland");
    const loop = offersFor(three, W, key("averland"), key("nuln")).find((o) => o.kind.name === "in")!;
    expect(loop.canPick).toBe(false);
    expect(loop.why).toMatch(/inside averland already/);
  });
});

describe("joining", () => {
  it("a plain link runs in the order picked", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("rules")!, key("nuln"));
    const link = linkOf(made.items, made.link!)!;
    expect([link.from, link.to]).toEqual([key("countess"), key("nuln")]);
    expect(linkTitle(made.items, link)).toBe("countess — rules — nuln");
    expect(linksFrom(made.items, W, key("nuln")).map((l) => l.word)).toEqual(["ruled by"]);
  });

  it("picked the wrong way round, a one-way link is swapped to fit", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("nuln"), kinds.get("rules")!, key("countess"));
    const link = linkOf(made.items, made.link!)!;
    expect([link.from, link.to]).toEqual([key("countess"), key("nuln")]);
  });

  it("a strict misfit is refused", () => {
    const { items, kinds } = setUp();
    expect(join(items, W, key("averland"), kinds.get("rules")!, key("nuln")).problem).toMatch(/takes Person at the from end/);
  });

  it("a tree moves it inside; a group puts it in", () => {
    const { items, kinds } = setUp();
    const moved = join(items, W, key("nuln"), kinds.get("in")!, key("averland"));
    expect(parentOf(moved.items, W, key("nuln"), kinds.get("in"))).toBe(key("averland"));
    const grouped = join(moved.items, W, key("nuln"), kinds.get("in area")!, key("averland"));
    expect(grouped.problem).toBeUndefined();
    expect(join(grouped.items, W, key("nuln"), kinds.get("in area")!, key("averland")).problem).toMatch(/in that group already/);
  });

  it("links of a kind can repeat (dates tell them apart)", () => {
    const { items, kinds } = setUp();
    const once = join(items, W, key("countess"), kinds.get("feud with")!, key("count"));
    const offer = offersFor(once.items, W, key("count"), key("countess")).find((o) => o.kind.name === "feud with")!;
    expect(offer.note).toMatch(/joined by this already/);
    const twice = join(once.items, W, key("count"), kinds.get("feud with")!, key("countess"));
    expect(linksFrom(twice.items, W, key("count"))).toHaveLength(2);
  });
});

describe("one link", () => {
  it("swapping ends is checked like joining", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("rules")!, key("nuln"));
    expect(swapEnds(made.items, W, made.link!).problem).toMatch(/doesn't fit/);
    const feud = join(items, W, key("countess"), kinds.get("feud with")!, key("count"));
    const swapped = swapEnds(feud.items, W, feud.link!);
    expect(linkOf(swapped.items, feud.link!)!.from).toBe(key("count"));
  });

  it("its kind can change, keeping its key and what it carries", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("feud with")!, key("nuln"));
    const valued = setLinkValue(changeLink(made.items, made.link!, { start: "2502", note: "over taxes" }), made.link!, "strength", "−2");
    const changed = changeLinkKind(valued, W, made.link!, kinds.get("rules")!);
    expect(changed.problem).toBeUndefined();
    const link = linkOf(changed.items, made.link!)!;
    expect([link.linkKind, linkValue(link, "strength"), link.start, link.note]).toEqual([kinds.get("rules"), "−2", "2502", "over taxes"]);
    expect(changeLinkKind(valued, W, made.link!, kinds.get("in")!).problem).toMatch(/countess doesn't fit/);
  });

  it("blank fields are dropped; removing takes it out", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("feud with")!, key("count"));
    const blank = changeLink(made.items, made.link!, { note: "" });
    expect("note" in linkOf(blank, made.link!)!).toBe(false);
    expect(linkOf(removeLink(blank, made.link!), made.link!)).toBeUndefined();
  });

  it("is drawn in its own colour and line, else its link kind's; one-way with an arrow", () => {
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("rules")!, key("nuln"));
    const styled = made.items.map((i) => (i.key === kinds.get("rules") ? { ...(i as LinkKind), colour: "#123456", line: "dashed" as const } : i));
    expect(linkStyle(styled, W, linkOf(styled, made.link!)!)).toEqual({ colour: "#123456", line: "dashed", arrow: true });
    const own = changeLink(styled, made.link!, { colour: "#abcdef", line: "dotted" });
    expect(linkStyle(own, W, linkOf(own, made.link!)!)).toEqual({ colour: "#abcdef", line: "dotted", arrow: true });
  });
});

describe("hidden from a tree (owner, 27 Nov)", () => {
  it("holds nothing there: putting something inside it is refused", () => {
    const { items, kinds } = setUp();
    const tree = kinds.get("in")!;
    const hidden = hideHere(items, tree, key("averland"), true);
    expect(setParent(hidden, W, key("nuln"), key("averland"), tree).problem).toMatch(/hidden from this tree/);
  });

  it("put inside something, it's no longer hidden", () => {
    const { items, kinds } = setUp();
    const tree = kinds.get("in")!;
    const hidden = hideHere(items, tree, key("nuln"), true);
    const moved = setParent(hidden, W, key("nuln"), key("averland"), tree).items;
    const out = setParent(moved, W, key("nuln"), null, tree).items;
    expect(hiddenIn(out, W, tree, key("nuln"))).toBeNull(); // taken out again, it's loose, not hidden
  });
});

describe("changing an end", () => {
  it("goes through the same check as joining", async () => {
    const { changeEnd } = await import("../src/world/links");
    const { items, kinds } = setUp();
    const made = join(items, W, key("countess"), kinds.get("rules")!, key("nuln"));
    expect(linkOf(changeEnd(made.items, W, made.link!, "to", key("averland")).items, made.link!)!.to).toBe(key("averland"));
    expect(changeEnd(made.items, W, made.link!, "to", key("count")).problem).toMatch(/doesn't fit/);
  });
});

describe("what a link carries: fields (owner, 27 Nov)", () => {
  function road() {
    const { items, kinds } = setUp();
    const withFields = items.map((i) => (i.key === kinds.get("adjacent to") ? { ...(i as LinkKind), fields: [{ name: "distance" }, { name: "speed", byDirection: true }] } : i));
    const made = join(withFields, W, key("nuln"), kinds.get("adjacent to")!, key("averland"));
    return { items: made.items, link: made.link! };
  }

  it("a field the same both ways, and one kept each way", () => {
    const { items, link } = road();
    let next = setLinkValue(items, link, "distance", "40");
    next = setLinkValue(next, link, "speed", "4", "from to");
    next = setLinkValue(next, link, "speed", "7", "to from");
    const l = linkOf(next, link)!;
    expect(linkValue(l, "speed", "from to")).toBe("4");
    expect(fieldSummary(next, l)).toBe("distance 40 · speed → 4, ← 7");
    expect(fieldSummary(next, l, key("averland"))).toBe("distance 40 · speed → 7, ← 4"); // read from the other end
  });

  it("a link can carry fields of its own; blank takes a value off", () => {
    const { items, link } = road();
    let next = setLinkValue(items, link, "toll", "2 shillings");
    expect(fieldsOfLink(next, linkOf(next, link)!).map((f) => [f.name, f.offered])).toEqual([["distance", true], ["speed", true], ["toll", false]]);
    next = setLinkValue(next, link, "toll", "");
    expect(linkOf(next, link)!.fields).toBeUndefined();
    next = removeLinkField(setLinkValue(next, link, "speed", "4", "from to"), link, "speed");
    expect(linkOf(next, link)!.fields).toBeUndefined();
  });

  it("a single value from before is upgraded into a field named as its kind named it", () => {
    const { items, kinds } = setUp();
    const old = items.map((i) => (i.key === kinds.get("adjacent to") ? { ...(i as LinkKind), carries: "value" as const, valueName: "Distance" } : i));
    const made = join(old, W, key("nuln"), kinds.get("adjacent to")!, key("averland"));
    const withValue = made.items.map((i) => (i.key === made.link ? { ...i, value: "40 miles" } : i)) as Item[];
    const up = upgradeItems(withValue);
    expect((up.find((i) => i.key === kinds.get("adjacent to")) as LinkKind).fields).toEqual([{ name: "Distance" }]);
    const l = linkOf(up, made.link!)!;
    expect([l.value, linkValue(l, "Distance")]).toEqual([undefined, "40 miles"]);
  });
});

describe("roads and links that become things (owner, 27 Nov)", () => {
  it("a road is a world item; its stretches are links marked part of it, in order end to end", async () => {
    const { addPartOf, linksPartOf } = await import("../src/world/links");
    const { items, kinds } = setUp();
    const road: Thing = { key: key("north-road"), kind: "thing", world: W, name: "The Great North Road", kinds: [], fields: [] };
    const town = { ...(items.find((i) => i.key === key("nuln")) as Thing), key: key("wurtbad"), name: "wurtbad" };
    const holder: LinkKind = { key: `${W}.link-kind.made-of`, kind: "link-kind", world: W, name: "made of", direction: "one-way", hierarchy: "links" };
    let next: Item[] = [...items, road, town, holder];
    const adj = kinds.get("adjacent to")!;
    const a = join(next, W, key("nuln"), adj, key("wurtbad"));
    const b = join(a.items, W, key("averland"), adj, key("nuln"));
    next = addPartOf(addPartOf(b.items, b.link!, road.key).items, a.link!, road.key).items;
    expect(linksPartOf(next, W, road.key).map((l) => linkTitle(next, l))).toEqual(["averland — adjacent to — nuln", "nuln — adjacent to — wurtbad"]);
    const { removePartOf } = await import("../src/world/links");
    expect(linkOf(removePartOf(next, a.link!, road.key), a.link!)!.partOf).toBeUndefined();
  });

  it("a link made a thing: a world item stands for it; removing the item leaves the link", async () => {
    const { makeLinkAThing, linkStoodFor } = await import("../src/world/links");
    const { removeThing } = await import("../src/world/world");
    const { items, kinds } = setUp();
    const made = join(items, W, key("nuln"), kinds.get("adjacent to")!, key("averland"));
    const thing = makeLinkAThing(made.items, W, made.link!);
    expect(thing.items.find((i) => i.key === thing.thing)!.name).toBe("nuln – averland");
    expect(linkStoodFor(thing.items, thing.thing!)!.key).toBe(made.link);
    const gone = removeThing(thing.items, thing.thing!);
    expect(linkOf(gone, made.link!)!.asThing).toBeUndefined();
  });
});
