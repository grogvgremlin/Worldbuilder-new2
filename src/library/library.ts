// The library: every item on the device, kept consistent after each upload.
// Data structure: rebuild/data-structure.md §2 (stubs), §5 (dependencies), §9 (upload as a draft).
// Build-log Part B decisions 8, 25: a name that matches nothing becomes a stub item, flagged
// "not entered yet", in a stubs package of its own; a real item of the same name, loaded later, wins.
//
// Stubs are made again from the names every time the library changes, so they never go stale.

import type { Equipment, Item, Package, SpecialRule, Unit } from "../items/items";
import { itemKey } from "../items/keys";
import { NameIndex, resolveNames, type Unmatched } from "../packages/resolve";

export type Refreshed = { items: Item[]; stubbed: Unmatched[] };

// Names matched across everything; a stub for each name that still matches nothing.
export function refreshLibrary(all: Item[]): Refreshed {
  const items = all.filter((i) => keptOnRefresh(i, all));
  const firstPass = resolveNames(items, new NameIndex(items));
  const stubs = makeStubs(firstPass, items);
  const withStubs = [...items, ...stubs];
  resolveNames(withStubs, new NameIndex(withStubs));
  return { items: withStubs, stubbed: firstPass };
}

// Everything except what the app made last time: stub packages and the stubs in them.
function keptOnRefresh(item: Item, all: Item[]): boolean {
  if (item.kind === "package" && item.stubsFor) return false;
  if (item.status === "stub") return isEnteredStub(item, all);
  return true;
}

// A stub entered by hand in a sheet ("rulebook: not entered") is the owner's item, not one the app made.
function isEnteredStub(item: Item, all: Item[]): boolean {
  if (item.status !== "stub") return false;
  const home = all.find((i) => i.key === item.homePackage) as Package | undefined;
  return home !== undefined && !home.stubsFor;
}

function makeStubs(unmatched: Unmatched[], items: Item[]): Item[] {
  const packages = new Map(items.filter((i): i is Package => i.kind === "package").map((p) => [p.key, p]));
  const made = new Map<string, Item>();
  const stubPackages = new Map<string, Package>();
  for (const u of unmatched) {
    const owner = u.inPackage ? packages.get(u.inPackage) : undefined;
    if (!owner || u.kinds[0] === "slot-kind") continue;
    const kind = u.kinds[0];
    const key = itemKey(owner.game, kind, u.name);
    if (made.has(key)) continue;
    const stubPackage = stubPackageFor(owner, stubPackages);
    stubPackage.members.push(key);
    made.set(key, stubItem(kind, key, u.name, stubPackage.key));
  }
  return [...stubPackages.values(), ...made.values()];
}

function stubPackageFor(owner: Package, made: Map<string, Package>): Package {
  const existing = made.get(owner.key);
  if (existing) return existing;
  const pkg: Package = {
    key: `${owner.key}.stubs`,
    kind: "package",
    name: `Stubs: ${owner.name}`,
    game: owner.game,
    layer: owner.layer,
    members: [],
    includes: [],
    needsStated: [],
    stubsFor: owner.key,
  };
  made.set(owner.key, pkg);
  return pkg;
}

function stubItem(kind: string, key: string, name: string, homePackage: string): Item {
  const common = { key, name, homePackage, status: "stub" as const };
  if (kind === "equipment") return { ...common, kind: "equipment", countsAs: [], aliases: [], stats: {}, rules: [] } satisfies Equipment;
  if (kind === "unit") return { ...common, kind: "unit", class: "unit", rows: [{ type: "Unit", stats: {}, equipment: [], rules: [], statuses: [] }] } satisfies Unit;
  return { ...common, kind: "special-rule" } satisfies SpecialRule;
}

// --- Uploads --------------------------------------------------------------------------------------

// What an upload would change, item by item, before it's accepted.
export type UploadPlan = {
  library: Item[]; // the library as it would be
  added: Item[];
  changed: Item[];
  unchanged: Item[];
  removed: Item[]; // items an uploaded package no longer has
  stubbed: Unmatched[];
};

// An uploaded package replaces the one on the device whole: items it no longer lists go.
export function planUpload(current: Item[], uploaded: Item[]): UploadPlan {
  const uploadedPackages = new Set(uploaded.filter((i) => i.kind === "package").map((p) => p.key));
  const uploadedKeys = new Set(uploaded.map((i) => i.key));
  const removed = current.filter((i) => i.homePackage && uploadedPackages.has(i.homePackage) && !uploadedKeys.has(i.key));
  const byKey = new Map(current.filter((i) => !removed.includes(i)).map((i) => [i.key, i]));
  for (const item of uploaded) byKey.set(item.key, item);
  const { items, stubbed } = refreshLibrary([...byKey.values()]);
  const before = new Map(current.map((i) => [i.key, JSON.stringify(i)]));
  const plan: UploadPlan = { library: items, added: [], changed: [], unchanged: [], removed, stubbed: stubbed.filter((u) => uploadedKeys.has(u.inPackage ?? "")) };
  for (const item of items) {
    if (!uploadedKeys.has(item.key)) continue;
    const old = before.get(item.key);
    if (old === undefined) plan.added.push(item);
    else if (old === JSON.stringify(item)) plan.unchanged.push(item);
    else plan.changed.push(item);
  }
  return plan;
}

// --- Moving an item to another book -----------------------------------------------------------------

// The item's home changes and it's listed in the new package instead of the old one. Its key stays,
// so everything that names it still finds it; dependencies follow on the next read.
export function moveItem(items: Item[], key: string, toPackage: string): Item[] {
  const item = items.find((i) => i.key === key);
  if (!item || !item.homePackage || item.homePackage === toPackage) return items;
  const from = item.homePackage;
  const moved = items.map((i) => {
    if (i.key === key) return { ...i, homePackage: toPackage } as Item;
    if (i.kind === "package" && i.key === from) return { ...i, members: i.members.filter((k) => k !== key) };
    if (i.kind === "package" && i.key === toPackage) return { ...i, members: [...i.members, key] };
    return i;
  });
  return refreshLibrary(moved).items;
}
