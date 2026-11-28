// The library: every item on the device, kept consistent after each upload.
// Data structure: rebuild/data-structure.md §2 (stubs), §5 (dependencies), §9 (upload as a draft).
// Build-log Part B decisions 8, 25: a name that matches nothing becomes a stub item, flagged
// "not entered yet", in a stubs package of its own; a real item of the same name, loaded later, wins.
//
// Stubs are made again from the names every time the library changes, so they never go stale.

import type { Equipment, Item, Package, SpecialRule, Spell, Unit } from "../items/items";
import { itemKey } from "../items/keys";
import { NameIndex, resolveNames, type Unmatched } from "../packages/resolve";
import { unitsToDifferences } from "../rules/race-deltas";

export type Refreshed = { items: Item[]; stubbed: Unmatched[] };

// Names matched across everything; a stub for each name that still matches nothing.
export function refreshLibrary(all: Item[]): Refreshed {
  const items = all.filter((i) => keptOnRefresh(i, all));
  const firstPass = resolveNames(items, new NameIndex(items));
  const stubs = makeStubs(firstPass, items);
  const withStubs = [...items, ...stubs];
  resolveNames(withStubs, new NameIndex(withStubs));
  // Units' printed stats kept as differences from their race, now every name is matched.
  return { items: unitsToDifferences(withStubs), stubbed: firstPass };
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
  // A name several books use but none enters is stubbed once, in the first of them by key, so the
  // result doesn't depend on the order the books were uploaded in.
  const byPackage = [...unmatched].sort((a, b) => (a.inPackage ?? "").localeCompare(b.inPackage ?? ""));
  for (const u of byPackage) {
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
  if (kind === "spell") return { ...common, kind: "spell", rules: [] } satisfies Spell;
  return { ...common, kind: "special-rule" } satisfies SpecialRule;
}

// --- Uploads --------------------------------------------------------------------------------------

// A name an upload brings that another book already has, with different content: the owner chooses.
//   existing — keep the one already there; the new book's names point at it
//   new      — take the new one; both books then use it
//   both     — keep both; the new one lives in the new book (its names find it first)
// Same name and same content isn't a clash: it's the same item, kept once (owner, 22 Nov).
export type ClashChoice = "existing" | "new" | "both";
export type Clash = { key: string; name: string; existing: Item; incoming: Item; choice?: ClashChoice };

// What an upload would change, item by item, before it's accepted.
export type UploadPlan = {
  library: Item[]; // the library as it would be
  added: Item[];
  changed: Item[];
  unchanged: Item[];
  removed: Item[]; // items an uploaded package no longer has
  shared: Item[]; // same name, same content as another book's: kept once
  clashes: Clash[];
  undecided: boolean; // a clash still needs a choice
  stubbed: Unmatched[];
};

// An uploaded package replaces the one on the device whole: items it no longer lists go.
export function planUpload(current: Item[], uploadedIn: Item[], choices: Record<string, ClashChoice> = {}): UploadPlan {
  let uploaded = structuredClone(uploadedIn);
  const uploadedPackages = new Set(uploaded.filter((i) => i.kind === "package").map((p) => p.key));
  const currentByKey = new Map(current.map((i) => [i.key, i]));
  const shared: Item[] = [];
  const clashes: Clash[] = [];
  const dropFromPackage = new Map<string, Set<string>>(); // package key -> member keys to drop
  const renames = new Map<string, string>(); // old key -> new key, in the uploaded package
  const drop = (pkg: string | undefined, key: string) => pkg && dropFromPackage.set(pkg, new Set([...(dropFromPackage.get(pkg) ?? []), key]));

  for (const incoming of uploaded) {
    const existing = currentByKey.get(incoming.key);
    if (!existing || !existing.homePackage || !incoming.homePackage) continue;
    if (existing.homePackage === incoming.homePackage || uploadedPackages.has(existing.homePackage)) continue;
    if (existing.status === "stub") continue; // a name not entered yet: the real item simply takes its place
    if (sameContent(existing, incoming)) {
      shared.push(existing);
      drop(incoming.homePackage, incoming.key);
      continue;
    }
    // Kept both last time: the new book's own copy is already there under its own key.
    const ownCopy = `${incoming.key}.${incoming.homePackage.split(".").pop()}`;
    const choice = choices[incoming.key] ?? (currentByKey.get(ownCopy)?.homePackage === incoming.homePackage ? "both" : undefined);
    clashes.push({ key: incoming.key, name: incoming.name, existing, incoming, choice });
    if (choice === "new") drop(existing.homePackage, incoming.key);
    else if (choice === "both") renames.set(incoming.key, ownCopy);
    else drop(incoming.homePackage, incoming.key); // "existing", or not chosen yet
  }

  // Apply: drop what's kept elsewhere, rename what's kept twice, fix the package lists.
  const dropped = new Set([...dropFromPackage.entries()].filter(([pkg]) => uploadedPackages.has(pkg)).flatMap(([, keys]) => [...keys]));
  uploaded = uploaded
    .filter((i) => !(dropped.has(i.key) && i.kind !== "package"))
    .map((i) => {
      if (renames.has(i.key)) return { ...i, key: renames.get(i.key)! } as Item;
      if (i.kind === "package") {
        const gone = dropFromPackage.get(i.key) ?? new Set();
        return { ...i, members: i.members.filter((k) => !gone.has(k)).map((k) => renames.get(k) ?? k) };
      }
      return i;
    });
  const adjusted = current.map((i) => {
    const gone = i.kind === "package" ? dropFromPackage.get(i.key) : undefined;
    return gone && !uploadedPackages.has(i.key) ? ({ ...i, members: (i as { members: string[] }).members.filter((k) => !gone.has(k)) } as Item) : i;
  });

  const uploadedKeys = new Set(uploaded.map((i) => i.key));
  const removed = adjusted.filter((i) => i.homePackage && uploadedPackages.has(i.homePackage) && !uploadedKeys.has(i.key));
  const byKey = new Map(adjusted.filter((i) => !removed.includes(i)).map((i) => [i.key, i]));
  for (const item of uploaded) byKey.set(item.key, item);
  const { items, stubbed } = refreshLibrary([...byKey.values()]);
  const before = new Map(current.map((i) => [i.key, JSON.stringify(i)]));
  const plan: UploadPlan = {
    library: items,
    added: [],
    changed: [],
    unchanged: [],
    removed,
    shared,
    clashes,
    undecided: clashes.some((c) => !c.choice),
    stubbed: stubbed.filter((u) => uploadedPackages.has(u.inPackage ?? "")),
  };
  for (const item of items) {
    if (!uploadedKeys.has(item.key)) continue;
    const old = before.get(item.key);
    if (old === undefined) plan.added.push(item);
    else if (old === JSON.stringify(item)) plan.unchanged.push(item);
    else plan.changed.push(item);
  }
  return plan;
}

// The same content: everything but where it lives and which items its names matched.
function sameContent(a: Item, b: Item): boolean {
  const plain = (i: Item) => JSON.stringify(i, (k, v) => (k === "homePackage" || k === "item" ? undefined : v));
  return plain(a) === plain(b);
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

// --- Removing packages from the device ------------------------------------------------------------

// The packages go, and every item that lives in them; names elsewhere that pointed at them become stubs
// on the refresh. Contexts that listed them say so (a package that isn't on the device).
export function removePackages(items: Item[], packageKeys: string[]): Item[] {
  const gone = new Set(packageKeys);
  const kept = items.filter((i) => !gone.has(i.key) && !(i.homePackage && gone.has(i.homePackage)));
  return refreshLibrary(kept).items;
}

// A game goes with all its packages; contexts made for it stay (they say the game is missing).
export function removeGame(items: Item[], gameKey: string): Item[] {
  const game = items.find((i) => i.key === gameKey);
  if (!game || game.kind !== "game") return items;
  const packages = items.filter((i) => i.kind === "package" && i.game === game.shortName).map((p) => p.key);
  return removePackages(items.filter((i) => i.key !== gameKey), packages);
}
