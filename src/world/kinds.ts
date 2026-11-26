// Kinds of world item and their flavours (owner, 26 Nov): a kind can be a flavour of another (City of
// Place; Free city of City). A flavour has its parents' fields as well as its own, and whatever
// expects a kind accepts its flavours, including flavours added later.
// Design: design/world-structure.md §2 (kinds set expectations and offer fields; the app warns, never
// blocks; link kinds declare what they expect at each end). Flavours are the owner's addition: see
// the build log, 26 Nov, "Questions for design".

import type { Item, KindField, ThingKind } from "../items/items";
import { thingKindsIn } from "./world";

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
    const here = all.filter((k) => (parent ? k.flavourOf === parent : !k.flavourOf || !keys.has(k.flavourOf))).sort((a, b) => a.name.localeCompare(b.name));
    for (const k of here) {
      if (out.some((o) => o.kind.key === k.key)) continue;
      out.push({ kind: k, depth });
      walk(k.key, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}
