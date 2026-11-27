// Connections: joining two world items, ends first (owner, 26–27 Nov).
// Pick two items, A then B; every link kind is offered, those whose ends fit first, the rest with the
// reason. A Strict link kind's misfit can't be picked; a Warn-only one can, and is flagged. A tree
// moves A inside B; a group puts A in B; a plain connection (hierarchy none) links A to B, in the
// order picked. Also: an item's plain links read from its end, swapping a link's ends, changing its
// link kind, removing it, and how a link is drawn.
// Design: design/world-structure.md §3 (one graph; direction; carries; links of a kind can repeat),
// spec/authoring/authoring-v2.md §1.1 (ends first; misfits greyed with the reason). Strict by default
// is the owner's (build log, 26 Nov, "Questions for design").

import type { Item, Link, LinkKind, Thing, WorldMap } from "../items/items";
import { inOrder, isStrict, itemFits, misfit } from "./kinds";
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
  const offers = linkKindsInOrder(items, world).filter((k) => k.hierarchy !== "links").map((kind) => offerOne(items, world, kind, from, to));
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
export function fieldsOfLink(items: Item[], link: Link): { name: string; byDirection: boolean; offered: boolean; about?: string; choices?: string[] }[] {
  const offered = (linkKindOf(items, link.linkKind)?.fields ?? []).map((f) => ({ name: f.name, byDirection: !!f.byDirection, offered: true, about: f.about, choices: f.choices }));
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

// --- Link containers, and links that become things (owner, 27 Nov) --------------------------------
// Nothing here is about roads: any world item can hold links (a road, a river, a border, a trade
// route). What may hold what is the world's own setting: a link container kind (a container kind
// that holds connections), set up under Kinds → Containers. A link can be in several link containers,
// as an item can be in several groups.
// For example, the Great North Road is a world item with its own name, entry, fields and links (ruled
// by, sacred to). Its links are each part of it, carrying distance and speed each way. A link that
// needs links of its own is made a thing: a world item that stands for the link.
// Design: design/world-structure.md §3 ("a link that needs links of its own becomes a thing"), §4
// (transit networks: segments, part of, routes with speed by direction).

// The world's link container kinds, in its order.
export function linkContainerKinds(items: Item[], world: string): LinkKind[] {
  return linkKindsInOrder(items, world).filter((k) => k.hierarchy === "links");
}

// The link container kinds that would take this link in this item: the link's kind among what it holds
// (nothing listed: any), the item among its holders' kinds (nothing listed: any).
export function containerKindsFor(items: Item[], world: string, linkKind: string, whole: string): LinkKind[] {
  const item = items.find((i): i is Thing => i.kind === "thing" && i.key === whole);
  if (!item) return [];
  return linkContainerKinds(items, world).filter((k) => {
    const holds = k.expectsFrom ?? [];
    return (holds.length === 0 || holds.includes(linkKind)) && itemFits(items, world, item.kinds, { take: k.expectsTo ?? [], leave: k.exclude ?? [] });
  });
}

// Why a link can't be part of an item (no link container kind takes it there), or null if one does.
export function partOfMisfit(items: Item[], world: string, key: string, whole: string): string | null {
  const link = linkOf(items, key);
  const item = items.find((i): i is Thing => i.kind === "thing" && i.key === whole);
  if (!link || !item) return null;
  if (containerKindsFor(items, world, link.linkKind, whole).length) return null;
  const kindName = linkKindOf(items, link.linkKind)?.name ?? link.linkKind;
  if (!linkContainerKinds(items, world).length) return `no link container kind yet (Kinds → Containers → a link container)`;
  return `no link container kind holds "${kindName}" links in ${item.name}`;
}

// Whether a misfit stops it: unless some link container kind holding this kind of link is Warn only.
function partOfRefused(items: Item[], world: string, linkKind: string): boolean {
  const holding = linkContainerKinds(items, world).filter((k) => !(k.expectsFrom ?? []).length || (k.expectsFrom ?? []).includes(linkKind));
  return !holding.some((k) => k.strictness === "warn");
}

// Whether a link can go in an item: "yes", "warn" (allowed, flagged) or "no".
export function canBePartOf(items: Item[], world: string, key: string, whole: string): "yes" | "warn" | "no" {
  const link = linkOf(items, key);
  if (!link) return "no";
  if (!partOfMisfit(items, world, key, whole)) return "yes";
  return partOfRefused(items, world, link.linkKind) ? "no" : "warn";
}

// The item kinds a new link container for this link could be: the holder kinds of the link container
// kinds that hold its kind (for the kind picker when making one).
export function holderKindsFor(items: Item[], world: string, linkKind: string): string[] {
  return [...new Set(linkContainerKinds(items, world).filter((k) => !(k.expectsFrom ?? []).length || (k.expectsFrom ?? []).includes(linkKind)).flatMap((k) => k.expectsTo ?? []))];
}

// Puts a link in a link container (an item), or takes it out. Refused where no link container kind
// takes it there (unless one holding its kind is Warn only).
export function addPartOf(items: Item[], key: string, whole: string): { items: Item[]; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  if (link.partOf?.includes(whole)) return { items };
  const wrong = partOfMisfit(items, link.world, key, whole);
  if (wrong && partOfRefused(items, link.world, link.linkKind)) return { items, problem: wrong };
  return { items: items.map((i) => (i.kind === "link" && i.key === key ? { ...i, partOf: [...(i.partOf ?? []), whole] } : i)) };
}

export function removePartOf(items: Item[], key: string, whole: string): Item[] {
  return items.map((i) => {
    if (i.kind !== "link" || i.key !== key) return i;
    const kept = (i.partOf ?? []).filter((k) => k !== whole);
    const { partOf, ...rest } = i;
    return kept.length ? { ...rest, partOf: kept } : rest;
  });
}

// The links that are part of an item, in order along it (see `alongLinks`).
export function linksPartOf(items: Item[], world: string, whole: string): Link[] {
  return alongLinks(items, world, whole).pieces.flatMap((p) => p.runs.flatMap((r) => r.links));
}

// Along an item made of links (owner, 27 Nov), worked out from its links, never stored:
//   - pieces: stretches that join up; more than one piece means a gap (flagged, not refused);
//   - each piece's runs: walked end to end from its start; a fork's other branch is a further run;
//   - each run's points: the items along it, in order (towns, crossroads: where stretches end);
//   - meets: at each point, the other link containers with a link ending there (junctions).
// It reads from its chosen start (`startsAt`) where that's on it, else from an end.
export type Run = { links: Link[]; points: string[] };
export type Along = { pieces: { runs: Run[] }[]; meets: Map<string, Thing[]> };

export function alongLinks(items: Item[], world: string, whole: string): Along {
  const parts = linksIn(items, world).filter((l) => !!l.partOf?.includes(whole));
  const start = items.find((i): i is Thing => i.kind === "thing" && i.key === whole)?.startsAt;
  const pieces = joinedPieces(parts).map((piece) => ({ runs: walk(items, piece, start) }));
  // The piece holding the chosen start first; then the longest.
  pieces.sort((a, b) => Number(hasPoint(b, start)) - Number(hasPoint(a, start)) || count(b) - count(a));
  const meets = new Map<string, Thing[]>();
  for (const point of new Set(parts.flatMap((l) => [l.from, l.to]))) {
    const others = new Set(linksIn(items, world).filter((l) => l.from === point || l.to === point).flatMap((l) => (l.partOf ?? []).filter((k) => k !== whole)));
    const containers = [...others].map((k) => items.find((i): i is Thing => i.kind === "thing" && i.key === k)).filter((t): t is Thing => !!t);
    if (containers.length) meets.set(point, containers);
  }
  return { pieces, meets };
}

const count = (p: { runs: Run[] }) => p.runs.reduce((n, r) => n + r.links.length, 0);
const hasPoint = (p: { runs: Run[] }, k?: string) => !!k && p.runs.some((r) => r.points.includes(k));

// Stretches split into groups that join up (share an end, directly or through others).
function joinedPieces(parts: Link[]): Link[][] {
  const left = [...parts];
  const out: Link[][] = [];
  while (left.length) {
    const piece = [left.shift()!];
    const points = new Set([piece[0].from, piece[0].to]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const l of [...left]) {
        if (!points.has(l.from) && !points.has(l.to)) continue;
        piece.push(l);
        points.add(l.from);
        points.add(l.to);
        left.splice(left.indexOf(l), 1);
        grew = true;
      }
    }
    out.push(piece);
  }
  return out;
}

// One piece walked end to end: from the chosen start if it's here, else from an end (an item only one
// stretch reaches; by name), else anywhere (a ring road). Branches left over are walked as further
// runs, each from where it leaves what's walked already.
function walk(items: Item[], piece: Link[], start?: string): Run[] {
  const left = [...piece].sort((a, b) => linkTitle(items, a).localeCompare(linkTitle(items, b)));
  const degree = (k: string) => left.filter((l) => l.from === k || l.to === k).length;
  const points = [...new Set(piece.flatMap((l) => [l.from, l.to]))];
  const ends = points.filter((k) => degree(k) === 1).sort((a, b) => nameOf(items, a).localeCompare(nameOf(items, b)));
  let from = start && points.includes(start) ? start : ends[0] ?? points[0];
  const seen = new Set<string>();
  const runs: Run[] = [];
  while (left.length) {
    const run: Run = { links: [], points: [from] };
    let at = from;
    seen.add(at);
    for (;;) {
      const next = left.find((l) => l.from === at || l.to === at);
      if (!next) break;
      left.splice(left.indexOf(next), 1);
      at = next.from === at ? next.to : next.from;
      run.links.push(next);
      run.points.push(at);
      seen.add(at);
    }
    if (run.links.length) runs.push(run);
    const branch = left.find((l) => seen.has(l.from) || seen.has(l.to));
    if (!branch) break;
    from = seen.has(branch.from) ? branch.from : branch.to;
  }
  return runs;
}

// Splits a link in two at an item (owner, 27 Nov: "splitting an existing link into two pieces and
// inserting an item"): A–B becomes A–X (keeping the link's key, so its card and its world item stay
// with it) and X–B, both with the same kind, road, fields, dates, note and look. Each half's fields
// (a distance) are then corrected on its card. On each map with both ends pinned and X not, X is
// pinned halfway. Refused if X is an end already, or a Strict link kind doesn't take it.
export function splitLink(items: Item[], world: string, key: string, at: string): { items: Item[]; second?: string; problem?: string } {
  const link = linkOf(items, key);
  if (!link) return { items, problem: "that link isn't there" };
  if (at === link.from || at === link.to) return { items, problem: "that item is an end of this link already" };
  if (isStrict(items, link.linkKind)) {
    const wrong = ends(items, world, link.linkKind, link.from, at) ?? ends(items, world, link.linkKind, at, link.to);
    if (wrong) return { items, problem: wrong };
  }
  const first: Link = { ...link, to: at };
  const { asThing, ...copied } = link;
  const second: Link = { ...copied, key: newKey(items, world, "link", `${at.split(".").pop()}-${link.linkKind.split(".").pop()}-${link.to.split(".").pop()}`), from: at };
  const out: Item[] = [];
  for (const i of items) {
    if (i.key === key) out.push(first, second);
    else if (i.kind === "map") out.push(pinHalfway(i, link.from, link.to, at));
    else out.push(i);
  }
  return { items: hideHere(out, link.linkKind, at, false), second: second.key };
}

function pinHalfway(map: WorldMap, a: string, b: string, at: string): WorldMap {
  const pa = map.pins.find((p) => p.thing === a);
  const pb = map.pins.find((p) => p.thing === b);
  if (!pa || !pb || map.pins.some((p) => p.thing === at)) return map;
  return { ...map, pins: [...map.pins, { thing: at, x: Math.round((pa.x + pb.x) / 2), y: Math.round((pa.y + pb.y) / 2) }] };
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
