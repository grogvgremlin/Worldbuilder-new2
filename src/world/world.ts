// Worlds: making one, finding what belongs to it, keys, and removing things from it.
// Design: design/world-structure.md §1–3 (things, kinds as world content, links); data structure §6.
// A world is a sandbox with `world: true` (owner, 22 Nov). Its kinds and link kinds are its own
// content, copied in from a starter when it's made, then changed in the app (§2: kinds are world
// content, never code).

import { slug } from "../items/keys";
import type { Item, Link, LinkKind, Sandbox, Thing, ThingKind, WorldMap } from "../items/items";
import starter from "./starter-world.json";
import sample from "./sample-world.json";

export type WorldStart = "starter" | "blank" | "sample";

// --- What belongs to a world ---------------------------------------------------------------------

export function worlds(items: Item[]): Sandbox[] {
  return items.filter((i): i is Sandbox => i.kind === "sandbox" && i.world);
}

export function worldOf(items: Item[], key: string): Sandbox | undefined {
  return worlds(items).find((w) => w.key === key);
}

export function thingsIn(items: Item[], world: string): Thing[] {
  return items.filter((i): i is Thing => i.kind === "thing" && i.world === world);
}

export function thingKindsIn(items: Item[], world: string): ThingKind[] {
  return items.filter((i): i is ThingKind => i.kind === "thing-kind" && i.world === world);
}

export function linkKindsIn(items: Item[], world: string): LinkKind[] {
  return items.filter((i): i is LinkKind => i.kind === "link-kind" && i.world === world);
}

export function linksIn(items: Item[], world: string): Link[] {
  return items.filter((i): i is Link => i.kind === "link" && i.world === world);
}

export function mapsIn(items: Item[], world: string): WorldMap[] {
  return items.filter((i): i is WorldMap => i.kind === "map" && i.world === world);
}

// Whether an item is world content (belongs to some world).
export function isWorldItem(item: Item): boolean {
  return "world" in item && typeof item.world === "string";
}

// --- Keys ----------------------------------------------------------------------------------------
// A world item's key reads world.kind.name: "averland-borders.thing.averheim". The world keeps
// two worlds' Averheims apart; the kind keeps a thing and a kind of the same name apart.

const KIND_IN_KEY: Record<string, string> = { thing: "thing", "thing-kind": "kind", "link-kind": "link-kind", link: "link", map: "map" };

export function newKey(items: Item[], world: string, kind: keyof typeof KIND_IN_KEY | string, name: string): string {
  const base = `${world}.${KIND_IN_KEY[kind] ?? kind}.${slug(name) || "unnamed"}`;
  const taken = new Set(items.map((i) => i.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function newWorldKey(items: Item[], name: string): string {
  const base = slug(name) || "world";
  const taken = new Set(items.map((i) => i.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// --- Making a world ------------------------------------------------------------------------------
// From the starter (one generic kind, "Place", and "in": owner, 25 Nov), blank (nothing), or the
// sample (the starter plus a handful of places and a map, to try things out on).

type StarterFile = {
  tree: string; // the name of the link kind places are contained by
  group?: string; // the name of the link kind places are grouped by (several groups at once)
  thingKinds: { name: string; icon?: string; about?: string; fields: { name: string; about?: string }[] }[];
  linkKinds: { name: string; reverseName?: string; direction: LinkKind["direction"]; hierarchy: LinkKind["hierarchy"]; about?: string; scope?: string[] }[];
};

type SampleFile = {
  name: string;
  description?: string;
  things: { name: string; kinds: string[]; in?: string; summary?: string; fields?: Record<string, string> }[];
  groups?: { group: string; members: string[] }[];
  maps: { name: string; width: number; height: number; pins: { thing: string; x: number; y: number }[] }[];
};

export function newWorld(items: Item[], name: string, start: WorldStart): Item[] {
  const world: Sandbox = { key: newWorldKey(items, name), kind: "sandbox", name: name.trim() || "New world", world: true };
  if (start === "blank") return [world];
  const made: Item[] = [world];
  addStarter(made, world, starter as StarterFile);
  if (start === "sample") addSample(made, world, sample as SampleFile, (starter as StarterFile).group);
  return inScopeAtTheTop(made);
}

function addStarter(made: Item[], world: Sandbox, file: StarterFile) {
  for (const k of file.thingKinds) {
    made.push({ key: newKey(made, world.key, "thing-kind", k.name), kind: "thing-kind", world: world.key, name: k.name, icon: k.icon, about: k.about, fields: k.fields });
  }
  for (const k of file.linkKinds) {
    const key = newKey(made, world.key, "link-kind", k.name);
    // Expects name kinds; stored as the kinds' keys (owner, 26 Nov: "in" and "in area" take places only).
    const kindKeys = (names?: string[]) => names?.map((n) => thingKindsIn(made, world.key).find((t) => t.name === n)?.key ?? n);
    made.push({ key, kind: "link-kind", world: world.key, name: k.name, reverseName: k.reverseName, direction: k.direction, hierarchy: k.hierarchy, about: k.about, scope: kindKeys(k.scope) });
    if (k.name === file.tree) world.tree = key;
  }
}

function addSample(made: Item[], world: Sandbox, file: SampleFile, groupKindName?: string) {
  if (file.description) world.description = file.description;
  const kindKey = (name: string) => thingKindsIn(made, world.key).find((k) => k.name === name)?.key ?? name;
  const thingKey = new Map<string, string>();
  for (const t of file.things) {
    const key = newKey(made, world.key, "thing", t.name);
    thingKey.set(t.name, key);
    const kinds = t.kinds.map(kindKey);
    const fields = Object.entries(t.fields ?? {}).map(([field, value]) => ({ field, value })); // the place's own fields
    made.push({ key, kind: "thing", world: world.key, name: t.name, kinds, summary: t.summary, fields });
  }
  for (const t of file.things) {
    if (!t.in || !world.tree) continue;
    made.push(newLink(made, world.key, thingKey.get(t.name)!, world.tree, thingKey.get(t.in)!));
  }
  const groupKind = linkKindsIn(made, world.key).find((k) => k.name === groupKindName)?.key;
  for (const g of file.groups ?? []) {
    if (!groupKind) continue;
    for (const member of g.members) made.push(newLink(made, world.key, thingKey.get(member)!, groupKind, thingKey.get(g.group)!));
  }
  for (const m of file.maps) {
    const pins = m.pins.map((p) => ({ thing: thingKey.get(p.thing)!, x: p.x, y: p.y }));
    made.push({ key: newKey(made, world.key, "map", m.name), kind: "map", world: world.key, name: m.name, width: m.width, height: m.height, pins });
  }
}

// --- Links ---------------------------------------------------------------------------------------

export function newLink(items: Item[], world: string, from: string, linkKind: string, to: string): Link {
  const key = newKey(items, world, "link", `${from.split(".").pop()}-${linkKind.split(".").pop()}-${to.split(".").pop()}`);
  return { key, kind: "link", world, name: "", from, linkKind, to };
}

// --- Removing ------------------------------------------------------------------------------------

// A thing goes with its links and its pins; what it held is left at the top of that tree, still in its
// scope (owner, 28 Nov), one level up being a choice the owner makes. Links that were stretches of it,
// or that it stood for, stay: they're just no longer part of it.
export function removeThing(items: Item[], key: string): Item[] {
  const trees = new Set(items.filter((i) => i.kind === "link-kind" && i.hierarchy === "one parent").map((i) => i.key));
  const held = items.filter((i): i is Link => i.kind === "link" && i.to === key && trees.has(i.linkKind));
  const kept = items.map((i) => {
    if (i.kind !== "link-kind" || !trees.has(i.key)) return i;
    const up = held.filter((l) => l.linkKind === i.key).map((l) => l.from);
    return up.length ? { ...i, inScope: [...new Set([...(i.inScope ?? []), ...up])].filter((k) => k !== key) } : i;
  });
  return kept
    .filter((i) => i.key !== key && !(i.kind === "link" && (i.from === key || i.to === key)))
    .map((i) => (i.kind === "map" ? { ...i, pins: i.pins.filter((p) => p.thing !== key) } : i))
    .map((i) => (i.kind === "link" && (i.partOf?.includes(key) || i.asThing === key) ? withoutThing(i, key) : i));
}

function withoutThing(link: Link, key: string): Link {
  const { partOf, asThing, ...rest } = link;
  const kept = (partOf ?? []).filter((k) => k !== key);
  return { ...rest, ...(kept.length ? { partOf: kept } : {}), ...(asThing && asThing !== key ? { asThing } : {}) };
}

// A thing kind goes from every thing that has it; their fields filled under it become one-offs; its
// flavours become flavours of its own parent (or of nothing).
export function removeThingKind(items: Item[], key: string): Item[] {
  const parent = items.find((i): i is ThingKind => i.kind === "thing-kind" && i.key === key)?.flavourOf;
  return items
    .filter((i) => i.key !== key)
    .map((i) => (i.kind === "thing-kind" && i.flavourOf === key ? { ...i, flavourOf: parent } : i))
    .map((i) => (i.kind === "thing" && i.kinds.includes(key) ? { ...i, kinds: i.kinds.filter((k) => k !== key), fields: i.fields.map((f) => (f.of === key ? { field: f.field, value: f.value } : f)) } : i));
}

export function removeWorld(items: Item[], world: string): Item[] {
  return items.filter((i) => i.key !== world && !(isWorldItem(i) && (i as { world: string }).world === world));
}

// A new world's trees start with whatever sits loose at their top in scope, as an existing world's did
// when scope came in (owner, 28 Nov). (Kept here, not in places.ts, which reads this file.)
function inScopeAtTheTop(made: Item[]): Item[] {
  return made.map((i) => {
    if (i.kind !== "link-kind" || i.hierarchy !== "one parent" || i.inScope !== undefined) return i;
    const linked = new Set(made.filter((l): l is Link => l.kind === "link" && l.linkKind === i.key).flatMap((l) => [l.from, l.to]));
    const takes = new Set(i.scope ?? []);
    const loose = made.filter((t): t is Thing => t.kind === "thing" && t.world === i.world && !linked.has(t.key) && (takes.size === 0 || t.kinds.some((k) => takes.has(k))));
    return { ...i, inScope: loose.map((t) => t.key) };
  });
}
