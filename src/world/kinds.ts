// Kinds of world item and their flavours (owner, 26 Nov): a kind can be a flavour of another (City of
// Place; Free city of City). A flavour has its parents' fields as well as its own, and whatever
// expects a kind accepts its flavours, including flavours added later.
// Design: design/world-structure.md §2 (kinds set expectations and offer fields; the app warns, never
// blocks; link kinds declare what they expect at each end). Flavours are the owner's addition: see
// the build log, 26 Nov, "Questions for design".

import type { Item, KindField, Link, LinkKind, Thing, ThingKind } from "../items/items";
import { linkKindsIn, newKey, thingKindsIn, worldOf } from "./world";

// A kind and the kinds it's a flavour of, from itself up: Free city, City, Place.
export function kindLine(items: Item[], world: string, kind: string): ThingKind[] {
  const kinds = new Map(thingKindsIn(items, world).map((k) => [k.key, k]));
  const line: ThingKind[] = [];
  const seen = new Set<string>();
  let at: string | undefined = kind;
  while (at && kinds.has(at) && !seen.has(at)) {
    seen.add(at);
    line.push(kinds.get(at)!);
    at = kinds.get(at)!.flavourOf;
  }
  return line;
}

// The flavours of a kind, at any depth.
export function flavoursOf(items: Item[], world: string, kind: string): ThingKind[] {
  return thingKindsIn(items, world).filter((k) => k.key !== kind && kindLine(items, world, k.key).some((a) => a.key === kind));
}

// Whether an item with these kinds counts as `wanted`: it has the kind itself, or a flavour of it.
export function hasKind(items: Item[], world: string, kinds: string[], wanted: string): boolean {
  return kinds.some((k) => kindLine(items, world, k).some((a) => a.key === wanted));
}

// Whether an item fits what a link kind expects at one end: nothing expected fits all; otherwise
// one of its kinds is an expected kind or a flavour of one (§3: a misfit warns, never blocks).
export function fitsExpected(items: Item[], world: string, kinds: string[], expected: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true;
  return expected.some((e) => hasKind(items, world, kinds, e));
}

// The fields a kind offers, its own and its parents': each with the kind it's named under
// (fields are named per kind, §2, so an inherited field stays the parent's).
export function fieldsOffered(items: Item[], world: string, kind: string): { of: string; field: KindField; inherited: boolean }[] {
  const line = kindLine(items, world, kind);
  const out: { of: string; field: KindField; inherited: boolean }[] = [];
  for (const k of [...line].reverse()) for (const f of k.fields) out.push({ of: k.key, field: f, inherited: k.key !== kind });
  return out;
}

// Makes `kind` a flavour of `parent` (or of nothing). Refused if that would make a loop.
export function setFlavourOf(items: Item[], world: string, kind: string, parent: string | null): { items: Item[]; problem?: string } {
  if (parent === kind) return { items, problem: "a kind can't be a flavour of itself" };
  if (parent && kindLine(items, world, parent).some((k) => k.key === kind)) return { items, problem: "that kind is already a flavour of this one" };
  return { items: items.map((i) => (i.kind === "thing-kind" && i.key === kind ? { ...i, flavourOf: parent ?? undefined } : i)) };
}

// Kinds in tree order (each followed by its flavours), with their depth, for lists and pickers.
export function kindTree(items: Item[], world: string): { kind: ThingKind; depth: number }[] {
  const all = thingKindsIn(items, world);
  const keys = new Set(all.map((k) => k.key));
  const out: { kind: ThingKind; depth: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    const here = inOrder(items, world, all.filter((k) => (parent ? k.flavourOf === parent : !k.flavourOf || !keys.has(k.flavourOf))));
    for (const k of here) {
      if (out.some((o) => o.kind.key === k.key)) continue;
      out.push({ kind: k, depth });
      walk(k.key, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

// --- What a link kind takes (owner, 26 Nov) -----------------------------------------------------
// Each end takes the kinds listed for it, else the link kind's scope (both ends); `exclude` removes
// kinds at both ends. For an item's kind, the nearest kind in its line that's listed decides: so
// "exclude Place" also excludes City, unless City is listed to take; and "take Place, exclude
// Fortress" takes every place but fortresses. Nothing listed to take: everything not excluded fits.

function linkKindOf(items: Item[], key: string): LinkKind | undefined {
  return items.find((i): i is LinkKind => i.kind === "link-kind" && i.key === key);
}

// What an end takes and leaves out: the same list for both ends, or each end's own (never both).
export function endRule(kind: LinkKind, end: "from" | "to"): { take: string[]; leave: string[] } {
  const take = kind.endsDiffer ? (end === "from" ? kind.expectsFrom : kind.expectsTo) ?? [] : kind.scope ?? [];
  return { take, leave: kind.exclude ?? [] };
}

// Switches between one list for both ends and a list per end, carrying the kinds across: Takes is
// copied to both ends; back again, the inside end's kinds become Takes.
export function setEndsDiffer(kind: LinkKind, differ: boolean): LinkKind {
  if (differ) return { ...kind, endsDiffer: true, expectsFrom: kind.scope, expectsTo: kind.scope, scope: undefined };
  return { ...kind, endsDiffer: undefined, scope: kind.expectsFrom ?? kind.scope, expectsFrom: undefined, expectsTo: undefined };
}

// Whether one kind fits an end: the nearest listed kind in its line decides.
function kindFits(items: Item[], world: string, kind: string, rule: { take: string[]; leave: string[] }): boolean {
  for (const k of kindLine(items, world, kind)) {
    if (rule.take.includes(k.key)) return true;
    if (rule.leave.includes(k.key)) return false;
  }
  return rule.take.length === 0;
}

// Whether an item with these kinds fits an end: one of its kinds fits.
export function itemFits(items: Item[], world: string, kinds: string[], rule: { take: string[]; leave: string[] }): boolean {
  if (kinds.length === 0) return rule.take.length === 0;
  return kinds.some((k) => kindFits(items, world, k, rule));
}

// Why an item doesn't fit one end of a link kind, or null if it does (whatever the strictness).
export function misfit(items: Item[], world: string, linkKind: string, end: "from" | "to", thing: string): string | null {
  const kind = linkKindOf(items, linkKind);
  const item = items.find((i): i is Thing => i.kind === "thing" && i.key === thing);
  if (!kind || !item) return null;
  const rule = endRule(kind, end);
  if (itemFits(items, world, item.kinds, rule)) return null;
  const name = (k: string) => thingKindsIn(items, world).find((t) => t.key === k)?.name ?? k;
  const takes = rule.take.length ? `takes ${rule.take.map(name).join(" or ")}` : `leaves out ${rule.leave.map(name).join(" and ")}`;
  return `"${kind.name}" ${takes} ${endWord(kind, end)}; ${item.name} doesn't fit`;
}

// How an end is named: a tree's or group's ends are inside / the container; a plain connection's
// are its from and to ends, or either end when it runs both ways.
export function endWord(kind: LinkKind, end: "from" | "to"): string {
  if (kind.hierarchy !== "none") return end === "from" ? "inside" : "as the container";
  if (!kind.endsDiffer) return "at either end";
  return end === "from" ? "at the from end" : "at the to end";
}

// Whether a link kind refuses misfits (strict, the default) or only flags them (warn).
export function isStrict(items: Item[], linkKind: string): boolean {
  return (linkKindOf(items, linkKind)?.strictness ?? "strict") === "strict";
}

// A misfit that stops the change: only for a strict link kind.
export function refusal(items: Item[], world: string, linkKind: string, end: "from" | "to", thing: string): string | null {
  return isStrict(items, linkKind) ? misfit(items, world, linkKind, end, thing) : null;
}

// Whether an item belongs in a tree at all: it fits one end or the other (a Place in "in terrain";
// never a Person). A tree that only warns shows everything.
export function fitsTree(items: Item[], world: string, tree: string | undefined, thing: string): boolean {
  if (!tree || !isStrict(items, tree)) return true;
  return misfit(items, world, tree, "from", thing) === null || misfit(items, world, tree, "to", thing) === null;
}

// Links that don't fit their link kind: kept under a warn-only link kind, or made before a rule changed
// (owner, 26 Nov: "both cases should at least warn"). Flagged, never removed: the owner decides.
export type Misfit = { link: Link; why: string };

export function misfitLinks(items: Item[], world: string): Misfit[] {
  const out: Misfit[] = [];
  for (const l of items) {
    if (l.kind !== "link" || l.world !== world) continue;
    const why = misfit(items, world, l.linkKind, "from", l.from) ?? misfit(items, world, l.linkKind, "to", l.to);
    if (why) out.push({ link: l, why });
  }
  return out;
}

export function linkMisfits(items: Item[], world: string): string[] {
  return misfitLinks(items, world).map((m) => m.why);
}

// The items at either end of a link that doesn't fit, to mark them in lists and on the Diagram. In a
// tree's view, only that tree's own links count (owner, 26 Nov: a link that fits here was marked
// because another tree's didn't).
export function itemsWithMisfits(items: Item[], world: string, linkKind?: string): Set<string> {
  return new Set(misfitLinks(items, world).filter((m) => !linkKind || m.link.linkKind === linkKind).flatMap((m) => [m.link.from, m.link.to]));
}

// --- Order -----------------------------------------------------------------------------------------

// Kinds and link kinds in the world's display order (owner, 26 Nov); any not placed come after, by name.
export function inOrder<T extends { key: string; name: string }>(items: Item[], world: string, list: T[]): T[] {
  const order = worldOf(items, world)?.kindOrder ?? [];
  const place = (k: string) => (order.includes(k) ? order.indexOf(k) : Number.MAX_SAFE_INTEGER);
  return [...list].sort((a, b) => place(a.key) - place(b.key) || a.name.localeCompare(b.name));
}

// Moves a kind or link kind up (-1) or down (+1) among its own list.
export function moveInOrder(items: Item[], world: string, list: { key: string; name: string }[], key: string, by: number): Item[] {
  const keys = inOrder(items, world, list).map((k) => k.key);
  const at = keys.indexOf(key);
  const to = at + by;
  if (at < 0 || to < 0 || to >= keys.length) return items;
  [keys[at], keys[to]] = [keys[to], keys[at]];
  const others = (worldOf(items, world)?.kindOrder ?? []).filter((k) => !keys.includes(k));
  return items.map((i) => (i.kind === "sandbox" && i.key === world ? { ...i, kindOrder: [...others, ...keys] } : i));
}

// --- Link kinds: copy and remove --------------------------------------------------------------------

// A copy of a link kind under a new name (owner, 26 Nov: "clone link type"): its settings, not its links.
export function cloneLinkKind(items: Item[], world: string, key: string, name: string): { items: Item[]; key?: string; problem?: string } {
  const source = linkKindOf(items, key);
  if (!source) return { items, problem: "that link kind isn't there" };
  if (!name.trim()) return { items, problem: "a copy needs a name" };
  if (linkKindsIn(items, world).some((k) => k.name.toLowerCase() === name.trim().toLowerCase())) return { items, problem: `there's a link kind called ${name.trim()} already` };
  const copy: LinkKind = { ...source, key: newKey(items, world, "link-kind", name), name: name.trim() };
  return { items: [...items, copy], key: copy.key };
}

// A link kind goes with all its links; a world grouped by it no longer has a main tree.
export function removeLinkKind(items: Item[], world: string, key: string): Item[] {
  return items
    .filter((i) => i.key !== key && !(i.kind === "link" && i.linkKind === key))
    .map((i) => (i.kind === "sandbox" && i.key === world && i.tree === key ? { ...i, tree: undefined } : i));
}
