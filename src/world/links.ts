// Connections: joining two world items, ends first (owner, 26–27 Nov).
// Pick two items, A then B; every link kind is offered, those whose ends fit first, the rest with the
// reason. A Strict link kind's misfit can't be picked; a Warn-only one can, and is flagged. A tree
// moves A inside B; a group puts A in B; a plain connection (hierarchy none) links A to B, in the
// order picked. Also: an item's plain links read from its end, swapping a link's ends, changing its
// link kind, removing it, and how a link is drawn.
// Design: design/world-structure.md §3 (one graph; direction; carries; links of a kind can repeat),
// spec/authoring/authoring-v2.md §1.1 (ends first; misfits greyed with the reason). Strict by default
// is the owner's (build log, 26 Nov, "Questions for design").

import type { Item, Link, LinkKind, Thing } from "../items/items";
import { inOrder, isStrict, misfit } from "./kinds";
import { addToGroup } from "./groups";
import { descendantsOf, hiddenByHand, hideHere, parentOf, setParent } from "./places";
import { linkKindsIn, linksIn, newKey, newLink } from "./world";

// One link kind offered for joining A to B.
//   fits: "yes" (both ends fit), "reversed" (only B to A fits: joining swaps them), "no";
//   canPick: fits, or reversed, or a misfit under a Warn-only link kind;
//   why: the reason it doesn't fit (or can't be picked); note: what joining will also do.
export type Offer = { kind: LinkKind; fits: "yes" | "reversed" | "no"; canPick: boolean; why?: string; note?: string };

export function linkKindsInOrder(items: Item[], world: string): LinkKind[] {
  return inOrder(items, world, linkKindsIn(items, world));
}

// Every link kind, for A then B: those that fit first, then the reversed ones, then the rest; each
// group in the world's order.
export function offersFor(items: Item[], world: string, from: string, to: string): Offer[] {
  const offers = linkKindsInOrder(items, world).map((kind) => offerOne(items, world, kind, from, to));
  const rank = (o: Offer) => (o.fits === "yes" && o.canPick ? 0 : o.fits === "reversed" && o.canPick ? 1 : o.canPick ? 2 : 3);
  return offers.map((o, n) => ({ o, n })).sort((a, b) => rank(a.o) - rank(b.o) || a.n - b.n).map(({ o }) => o);
}

function offerOne(items: Item[], world: string, kind: LinkKind, from: string, to: string): Offer {
  const blocked = blockedBy(items, world, kind, from, to);
  const why = ends(items, world, kind.key, from, to);
  if (!why) return blocked ? { kind, fits: "yes", canPick: false, why: blocked } : { kind, fits: "yes", canPick: true, note: noteFor(items, world, kind, from, to) };
  // One way: the other way round may fit (B in A, B rules A).
  if (kind.direction === "one-way" && !ends(items, world, kind.key, to, from) && !blockedBy(items, world, kind, to, from)) {
    return { kind, fits: "reversed", canPick: true, why: `${why}; the other way round fits`, note: noteFor(items, world, kind, to, from) };
  }
  const strict = isStrict(items, kind.key);
  if (strict || blocked) return { kind, fits: "no", canPick: false, why: blocked ?? why };
  return { kind, fits: "no", canPick: true, why: `${why} (warn only: allowed, flagged)`, note: noteFor(items, world, kind, from, to) };
}

// Why the ends don't fit, or null.
function ends(items: Item[], world: string, linkKind: string, from: string, to: string): string | null {
  return misfit(items, world, linkKind, "from", from) ?? misfit(items, world, linkKind, "to", to);
}

// What stops a tree or group join whatever the kinds: a loop, the same item twice, already in it.
function blockedBy(items: Item[], world: string, kind: LinkKind, from: string, to: string): string | null {
  if (from === to) return "an item can't be joined to itself";
  if (kind.hierarchy === "one parent") {
    if (parentOf(items, world, from, kind.key) === to) return `${nameOf(items, from)} is in ${nameOf(items, to)} already`;
    if (descendantsOf(items, world, from, kind.key).some((d) => d.key === to)) return `${nameOf(items, to)} is inside ${nameOf(items, from)} already`;
    if (hiddenByHand(items, kind.key, to)) return `${nameOf(items, to)} is hidden from this tree`;
  }
  if (kind.hierarchy === "several parents") {
    if (linksIn(items, world).some((l) => l.linkKind === kind.key && l.from === from && l.to === to)) return `${nameOf(items, from)} is in that group already`;
  }
  return null;
}

// What else joining does: a tree moves the item out of where it was; a plain link that's there already
// is added again (links of a kind can repeat, §3: dates tell them apart).
function noteFor(items: Item[], world: string, kind: LinkKind, from: string, to: string): string | undefined {
  if (kind.hierarchy === "one parent") {
    const now = parentOf(items, world, from, kind.key);
    return now ? `moves ${nameOf(items, from)} out of ${nameOf(items, now)}` : undefined;
  }
  if (kind.hierarchy === "none" && plainLinksBetween(items, world, from, to).some((l) => l.linkKind === kind.key)) return "they're joined by this already: this adds another";
  return undefined;
}

// Joins A to B by a link kind (B to A when it only fits that way round). Trees and groups go through
// their own rules (one parent at a time, no loops); a plain link is added. Returns the link's key.
export function join(items: Item[], world: string, from: string, linkKind: string, to: string): { items: Item[]; link?: string; problem?: string } {
  const kind = linkKindsIn(items, world).find((k) => k.key === linkKind);
  if (!kind) return { items, problem: "that link kind isn't there" };
  const offer = offerOne(items, world, kind, from, to);
  if (!offer.canPick) return { items, problem: offer.why };
  const [a, b] = offer.fits === "reversed" ? [to, from] : [from, to];
  const result = kind.hierarchy === "one parent" ? setParent(items, world, a, b, linkKind) : kind.hierarchy === "several parents" ? addToGroup(items, world, a, linkKind, b) : addPlain(items, world, a, linkKind, b);
  if (result.problem) return result;
  const made = linksIn(result.items, world).find((l) => l.linkKind === linkKind && l.from === a && l.to === b && !items.some((i) => i.key === l.key));
  return { items: result.items, link: made?.key };
}

// A plain link; both ends are then in its network by choice, so no longer hidden from it (as an item
// put inside something is no longer hidden from its tree).
function addPlain(items: Item[], world: string, from: string, linkKind: string, to: string): { items: Item[]; problem?: string } {
  const shown = hideHere(hideHere(items, linkKind, from, false), linkKind, to, false);
  return { items: [...shown, newLink(items, world, from, linkKind, to)] };
}

// --- One link --------------------------------------------------------------------------------------

export function linkOf(items: Item[], key: string): Link | undefined {
  return items.find((i): i is Link => i.kind === "link" && i.key === key);
}

export function linkKindOf(items: Item[], key: string): LinkKind | undefined {
  return items.find((i): i is LinkKind => i.kind === "link-kind" && i.key === key);
}

// Changes one link: anything but its ends and kind (dates, note, colour, line). Fields: setLinkValue.
export function changeLink(items: Item[], key: string, change: Partial<Pick<Link, "start" | "end" | "note" | "colour" | "line">>): Item[] {
  return items.map((i) => (i.kind === "link" && i.key === key ? clean({ ...i, ...change }) : i));
}

// Swaps a link's ends. Refused if a Strict link kind wouldn't take them that way round, or (a tree)
// it would make a loop or give the item a second container.
export function swapEnds(items: Item[], world: string, key: string): { items: Item[]; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  return relink(items, world, link, link.to, link.linkKind, link.from);
}

// Changes one end of a link to another item, through the same check as joining.
export function changeEnd(items: Item[], world: string, key: string, end: "from" | "to", thing: string): { items: Item[]; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  return end === "from" ? relink(items, world, link, thing, link.linkKind, link.to) : relink(items, world, link, link.from, link.linkKind, thing);
}

// Changes a link's kind, its ends kept, through the same check as joining.
export function changeLinkKind(items: Item[], world: string, key: string, linkKind: string): { items: Item[]; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  if (linkKind === link.linkKind) return { items };
  return relink(items, world, link, link.from, linkKind, link.to);
}

// The link taken out and made again as asked, through the same rules as joining (no loops, one
// container at a time, Strict ends), keeping its key and what it carries.
function relink(items: Item[], world: string, link: Link, from: string, linkKind: string, to: string): { items: Item[]; problem?: string } {
  const without = items.filter((i) => i.key !== link.key);
  const kind = linkKindOf(items, linkKind);
  if (!kind) return { items, problem: "that link kind isn't there" };
  const wrong = blockedBy(without, world, kind, from, to) ?? (isStrict(items, linkKind) ? ends(without, world, linkKind, from, to) : null);
  if (wrong) return { items, problem: wrong };
  const container = kind.hierarchy === "one parent" ? parentOf(without, world, from, linkKind) : null;
  if (container) return { items, problem: `${nameOf(items, from)} is in ${nameOf(items, container)} already in that tree` };
  const made = kind.hierarchy === "one parent" ? setParent(without, world, from, to, linkKind) : kind.hierarchy === "several parents" ? addToGroup(without, world, from, linkKind, to) : addPlain(without, world, from, linkKind, to);
  if (made.problem) return { items, problem: made.problem };
  const fresh = made.items.find((i) => i.kind === "link" && !items.some((o) => o.key === i.key));
  const kept = made.items.filter((i) => i !== fresh);
  const at = items.findIndex((i) => i.key === link.key);
  return { items: [...kept.slice(0, at), { ...link, from, linkKind, to }, ...kept.slice(at)] };
}

export function removeLink(items: Item[], key: string): Item[] {
  return items.filter((i) => !(i.kind === "link" && i.key === key));
}

// --- An item's connections ------------------------------------------------------------------------

// The plain links (hierarchy none) in a world.
export function plainLinks(items: Item[], world: string): Link[] {
  const plain = new Set(linkKindsIn(items, world).filter((k) => k.hierarchy === "none").map((k) => k.key));
  return linksIn(items, world).filter((l) => plain.has(l.linkKind));
}

export function plainLinksBetween(items: Item[], world: string, a: string, b: string): Link[] {
  return plainLinks(items, world).filter((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
}

// An item's plain links, read from its end: "rules" one way, "ruled by" the other; both ways, the same.
export type LinkFromHere = { link: Link; kind?: LinkKind; word: string; other: string; outward: boolean };

export function linksFrom(items: Item[], world: string, thing: string): LinkFromHere[] {
  return plainLinks(items, world)
    .filter((l) => l.from === thing || l.to === thing)
    .map((l) => {
      const kind = linkKindOf(items, l.linkKind);
      const outward = l.from === thing;
      return { link: l, kind, word: wordFrom(kind, l.linkKind, outward), other: outward ? l.to : l.from, outward };
    });
}

// A link kind's name read from one end.
export function wordFrom(kind: LinkKind | undefined, key: string, outward: boolean): string {
  const name = kind?.name ?? key;
  if (outward || kind?.direction === "both ways") return name;
  return kind?.reverseName || `(${name}) from`;
}

// A link's title: "Ostland — feud with — Hochland".
export function linkTitle(items: Item[], link: Link): string {
  return `${nameOf(items, link.from)} — ${linkKindOf(items, link.linkKind)?.name ?? link.linkKind} — ${nameOf(items, link.to)}`;
}

// --- How links are drawn ---------------------------------------------------------------------------
// From the link, else its link kind, else a colour from its place among the plain link kinds and a
// solid line (owner, 27 Nov: configurable on the link kind and on the link).

export const LINK_COLOURS = ["#b4541f", "#2f6f8f", "#6b8f2f", "#8f2f6b", "#5b4fb0", "#8f7a2f"];

export type LinkStyle = { colour: string; line: "solid" | "dashed" | "dotted"; arrow: boolean };

export function linkKindStyle(items: Item[], world: string, kind: LinkKind): Omit<LinkStyle, "arrow"> & { arrow: boolean } {
  const n = linkKindsInOrder(items, world).filter((k) => k.hierarchy === "none").findIndex((k) => k.key === kind.key);
  return {
    colour: kind.colour ?? LINK_COLOURS[Math.max(0, n) % LINK_COLOURS.length],
    line: kind.line ?? "solid",
    arrow: kind.direction === "one-way" && kind.arrows !== false,
  };
}

export function linkStyle(items: Item[], world: string, link: Link): LinkStyle {
  const kind = linkKindOf(items, link.linkKind);
  const base = kind ? linkKindStyle(items, world, kind) : { colour: LINK_COLOURS[0], line: "solid" as const, arrow: false };
  return { colour: link.colour ?? base.colour, line: link.line ?? base.line, arrow: base.arrow };
}

// --- What a link carries: fields (owner, 27 Nov) ---------------------------------------------------
// A link kind offers named fields; each is the same both ways (distance) or kept each way (speed:
// 4 from → to, 7 to → from). A link can also carry fields of its own, as an item can.

export type LinkDirection = "from to" | "to from";

// The fields a link shows: its kind's, then any of its own, each with whether it's kept each way.
export function fieldsOfLink(items: Item[], link: Link): { name: string; byDirection: boolean; offered: boolean; about?: string }[] {
  const offered = (linkKindOf(items, link.linkKind)?.fields ?? []).map((f) => ({ name: f.name, byDirection: !!f.byDirection, offered: true, about: f.about }));
  const own = [...new Set((link.fields ?? []).map((f) => f.field))]
    .filter((name) => !offered.some((o) => o.name === name))
    .map((name) => ({ name, byDirection: (link.fields ?? []).some((f) => f.field === name && f.direction), offered: false }));
  return [...offered, ...own];
}

// One field's value (one way, for a field kept each way); "" if not set.
export function linkValue(link: Link, field: string, direction?: LinkDirection): string {
  return (link.fields ?? []).find((f) => f.field === field && f.direction === direction)?.value ?? "";
}

// Sets one field's value (one way, for a field kept each way); blank takes it off.
export function setLinkValue(items: Item[], key: string, field: string, value: string, direction?: LinkDirection): Item[] {
  return items.map((i) => {
    if (i.kind !== "link" || i.key !== key) return i;
    const kept = (i.fields ?? []).filter((f) => !(f.field === field && f.direction === direction));
    const fields = value.trim() ? [...kept, { field, value: value.trim(), ...(direction ? { direction } : {}) }] : kept;
    const { fields: _old, ...rest } = i;
    return fields.length ? { ...rest, fields } : rest;
  });
}

// Takes a field off a link altogether (both ways).
export function removeLinkField(items: Item[], key: string, field: string): Item[] {
  return items.map((i) => {
    if (i.kind !== "link" || i.key !== key) return i;
    const fields = (i.fields ?? []).filter((f) => f.field !== field);
    const { fields: _old, ...rest } = i;
    return fields.length ? { ...rest, fields } : rest;
  });
}

// What a link carries, in a line: "distance 40 · speed → 4, ← 7". Read from one end (`from`), the
// arrows are as seen from there: → leaving it.
export function fieldSummary(items: Item[], link: Link, from?: string): string {
  const reversed = from !== undefined && from === link.to;
  const out: string[] = [];
  for (const f of fieldsOfLink(items, link)) {
    if (!f.byDirection) {
      const v = linkValue(link, f.name);
      if (v) out.push(`${f.name} ${v}`);
      continue;
    }
    const [away, back] = reversed ? ["to from", "from to"] : ["from to", "to from"];
    const there = linkValue(link, f.name, away as LinkDirection);
    const home = linkValue(link, f.name, back as LinkDirection);
    if (there || home) out.push(`${f.name} ${[there && `→ ${there}`, home && `← ${home}`].filter(Boolean).join(", ")}`);
  }
  return out.join(" · ");
}

function nameOf(items: Item[], key: string): string {
  return items.find((i): i is Thing => i.kind === "thing" && i.key === key)?.name ?? key;
}

// Blank optional fields dropped, so the stored link reads cleanly.
function clean(link: Link): Link {
  const out = { ...link } as Record<string, unknown>;
  for (const f of ["start", "end", "note", "colour", "line"]) if (out[f] === "" || out[f] === undefined) delete out[f];
  return out as Link;
}

// --- Roads and links that become things (owner, 27 Nov) --------------------------------------------
// A road (the Great North Road) is a world item with its own name, entry, fields and links (ruled by,
// sacred to). Its stretches are links, each marked as part of it, carrying distance and speed each
// way. A stretch that needs links of its own is made a thing: a world item that stands for the link.
// Design: design/world-structure.md §3 ("a link that needs links of its own becomes a thing"), §4
// (transit networks: segments, part of, routes with speed by direction).

// Marks a link as a stretch of an item (or of nothing). An item can't be part of a road it's an end of
// only by accident: that's allowed (a road ending at a town is fine).
export function setPartOf(items: Item[], key: string, whole: string | null): Item[] {
  return items.map((i) => {
    if (i.kind !== "link" || i.key !== key) return i;
    const { partOf, ...rest } = i;
    return whole ? { ...rest, partOf: whole } : rest;
  });
}

// The links that are stretches of an item, in the order they join up where they can (end to end),
// else by title.
export function stretchesOf(items: Item[], world: string, whole: string): Link[] {
  const parts = linksIn(items, world).filter((l) => l.partOf === whole);
  return inRoadOrder(items, parts);
}

// End to end: start from a stretch whose first end no other stretch reaches, and follow on.
function inRoadOrder(items: Item[], parts: Link[]): Link[] {
  const left = [...parts].sort((a, b) => linkTitle(items, a).localeCompare(linkTitle(items, b)));
  const out: Link[] = [];
  const ends = (l: Link) => [l.from, l.to];
  while (left.length) {
    const count = (k: string) => left.filter((l) => ends(l).includes(k)).length;
    const start = left.find((l) => count(l.from) === 1) ?? left.find((l) => count(l.to) === 1) ?? left[0];
    let at = count(start.from) === 1 ? start.to : start.from;
    out.push(start);
    left.splice(left.indexOf(start), 1);
    for (;;) {
      const next = left.find((l) => ends(l).includes(at));
      if (!next) break;
      out.push(next);
      left.splice(left.indexOf(next), 1);
      at = next.from === at ? next.to : next.from;
    }
  }
  return out;
}

// Makes a world item stand for a link (a stretch with its own name, entry and links). Named from the
// link ("Nuln – Wurtbad"), of the kinds given; the link stays and points at it.
export function makeLinkAThing(items: Item[], world: string, key: string, kinds: string[] = []): { items: Item[]; thing?: string; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  if (link.asThing) return { items, thing: link.asThing };
  const name = `${nameOf(items, link.from)} – ${nameOf(items, link.to)}`;
  const thingKey = newKey(items, world, "thing", name);
  const thing: Thing = { key: thingKey, kind: "thing", world, name, kinds, fields: [], summary: `${linkKindOf(items, link.linkKind)?.name ?? "link"}, as a world item` };
  return { items: [...items.map((i) => (i.key === key ? { ...link, asThing: thingKey } : i)), thing], thing: thingKey };
}

// The link a world item stands for, if it stands for one.
export function linkStoodFor(items: Item[], thing: string): Link | undefined {
  return items.find((i): i is Link => i.kind === "link" && i.asThing === thing);
}

// Lets go of the world item standing for a link (the item stays, as an ordinary one).
export function unlinkThing(items: Item[], key: string): Item[] {
  return items.map((i) => {
    if (i.kind !== "link" || i.key !== key) return i;
    const { asThing, ...rest } = i;
    return rest;
  });
}
