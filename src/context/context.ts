// A context: a game and the packages switched on for it. What's on, what each package brings with it,
// what can still be switched on, and anything that looks wrong.
// Design: design/v2-reconciliation.md §1 (build rows: four groups, each in order — books → FAQs →
// house rules → campaign; the game brings its core, which can't be switched off whole; a package in
// another group's layer, or of another game, warns); design/army-lists.md §3 (composition packages);
// build-log Part B decisions 21 (switching a package on brings what it needs, marked "needed by";
// derived, not stored; a needed package switched off by hand stays off, with a warning), 26 (only the
// context's game is offered), 29 (a pick-up game: no world, so no campaign packages).
//
// Pure: a context and the library in, a view out. Switching things on and off returns a new context.

import type { Context, ContextPackage, Game, Item, Package } from "../items/items";
import { slug } from "../items/keys";
import { isCompositionSet } from "../library/package-types";
import { foundNeeds } from "../packages/resolve";

export type Group = "books" | "faqs" | "house" | "campaign" | "composition";
export const GROUPS: { group: Group; title: string }[] = [
  { group: "books", title: "Books" },
  { group: "faqs", title: "FAQs" },
  { group: "house", title: "House rules" },
  { group: "campaign", title: "Campaign" },
  { group: "composition", title: "Composition" },
];

// One package as the context sees it.
export type PackageInContext = {
  key: string;
  name: string;
  how: "core" | "chosen" | "needed";
  on: boolean;
  neededBy: string[]; // names of the packages that need it
};

export type ContextView = {
  game: Game | undefined;
  packages: PackageInContext[]; // in the order they apply: what a package needs comes before it
  on: Set<string>; // every package key in play
  warnings: string[];
};

// --- Making one ---------------------------------------------------------------------------------

// A new context for a game: its core always on, its default composition set chosen.
export function newContext(name: string, game: Game, items: Item[], world?: string): Context {
  const taken = new Set(items.map((i) => i.key));
  let key = `context.${slug(name) || "game"}`;
  for (let n = 2; taken.has(key); n++) key = `context.${slug(name) || "game"}-${n}`;
  const context: Context = { key, kind: "context", name, game: game.shortName, books: [], faqs: [], house: [], campaign: [], composition: [] };
  if (world) context.world = world;
  for (const k of game.defaultComposition ?? []) context.composition.push({ package: k, on: true });
  return context;
}

// --- Reading it ---------------------------------------------------------------------------------

export function readContext(context: Context, items: Item[]): ContextView {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const game = items.find((i): i is Game => i.kind === "game" && i.shortName === context.game);
  const warnings: string[] = [];
  if (!game) warnings.push(`the game "${context.game}" isn't on the device`);

  const order: PackageInContext[] = [];
  const seen = new Map<string, PackageInContext>();
  const switchedOff = new Set(allListed(context).filter((p) => !p.on).map((p) => p.package));

  // Adds a package after what it needs (like imports: dependencies first).
  const add = (key: string, how: PackageInContext["how"], neededBy: string | null, path: string[]) => {
    const existing = seen.get(key);
    if (existing) {
      if (neededBy && !existing.neededBy.includes(neededBy)) existing.neededBy.push(neededBy);
      return;
    }
    const pkg = byKey.get(key);
    if (!pkg || pkg.kind !== "package") {
      warnings.push(`${neededBy ? `${neededBy} needs ` : ""}a package that isn't on the device (${key})`);
      return;
    }
    if (switchedOff.has(key) && how === "needed") {
      warnings.push(`${neededBy} needs ${pkg.name}, which is switched off here`);
      return;
    }
    if (path.includes(key)) return; // a loop of needs: stop
    for (const need of needsOf(pkg, items)) add(need, "needed", pkg.name, [...path, key]);
    const entry: PackageInContext = { key, name: pkg.name, how, on: true, neededBy: neededBy ? [neededBy] : [] };
    seen.set(key, entry);
    order.push(entry);
  };

  for (const k of game?.core ?? []) add(k, "core", null, []);
  for (const { group } of GROUPS) {
    for (const listed of context[group]) {
      if (listed.on) add(listed.package, "chosen", null, []);
      else if (!seen.has(listed.package)) order.push({ key: listed.package, name: byKey.get(listed.package)?.name ?? listed.package, how: "chosen", on: false, neededBy: [] });
    }
  }

  for (const { group } of GROUPS) for (const listed of context[group]) warnings.push(...groupWarnings(listed, group, context, byKey));
  if (!context.composition.some((c) => c.on)) warnings.push("no composition set: only the army lists' own limits apply");

  return { game, packages: order, on: new Set(order.filter((p) => p.on).map((p) => p.key)), warnings };
}

// What a package needs: what it says (needs), the book it's part of, and what its items name.
export function needsOf(pkg: Package, items: Item[]): string[] {
  const needs = [...pkg.needsStated];
  if (pkg.partOf) needs.push(pkg.partOf);
  for (const k of foundNeeds(pkg, items).keys()) needs.push(k);
  return [...new Set(needs)];
}

function allListed(context: Context): ContextPackage[] {
  return GROUPS.flatMap(({ group }) => context[group]);
}

function groupWarnings(listed: ContextPackage, group: Group, context: Context, byKey: Map<string, Item>): string[] {
  const pkg = byKey.get(listed.package);
  if (!pkg || pkg.kind !== "package") return [];
  const out: string[] = [];
  if (pkg.game !== context.game) out.push(`${pkg.name} is for another game (${pkg.game})`);
  const expected = groupFor(pkg, byKey);
  if (expected !== group) out.push(`${pkg.name} is listed under ${title(group)}, but it's ${title(expected)}`);
  if (group === "campaign" && !context.world) out.push(`${pkg.name} is a campaign package: campaign rules need a world`);
  return out;
}

function title(group: Group): string {
  return GROUPS.find((g) => g.group === group)!.title.toLowerCase();
}

// The group a package belongs in, by what it is.
export function groupFor(pkg: Package, byKey: Map<string, Item>): Group {
  if (isCompositionSet(pkg, byKey)) return "composition";
  if (pkg.layer === "faq") return "faqs";
  if (pkg.layer === "house") return "house";
  if (pkg.layer === "campaign") return "campaign";
  return "books";
}

// --- Changing it --------------------------------------------------------------------------------

// What can still be switched on, by group: this game's packages, not its core, not the app's stubs,
// not already on; campaign packages only in a world.
export function offered(context: Context, items: Item[]): Map<Group, Package[]> {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const view = readContext(context, items);
  const core = new Set(view.game?.core ?? []);
  const out = new Map<Group, Package[]>();
  for (const pkg of items.filter((i): i is Package => i.kind === "package")) {
    if (pkg.game !== context.game || pkg.stubsFor || core.has(pkg.key) || view.on.has(pkg.key)) continue;
    const group = groupFor(pkg, byKey);
    if (group === "campaign" && !context.world) continue;
    out.set(group, [...(out.get(group) ?? []), pkg]);
  }
  return out;
}

// Switches a package on, in the group it belongs to (listed again if it was switched off).
export function switchOn(context: Context, packageKey: string, items: Item[]): Context {
  const pkg = items.find((i): i is Package => i.kind === "package" && i.key === packageKey);
  if (!pkg) return context;
  const group = groupFor(pkg, new Map(items.map((i) => [i.key, i])));
  const next = structuredClone(context);
  const listed = next[group].find((p) => p.package === packageKey);
  if (listed) listed.on = true;
  else next[group].push({ package: packageKey, on: true });
  return next;
}

// Switches a package off. A package only brought in because something needs it can't be switched
// off on its own: it's switched off by listing it off (and the package needing it then warns).
export function switchOff(context: Context, packageKey: string, items: Item[]): Context {
  const next = structuredClone(context);
  for (const { group } of GROUPS) {
    const listed = next[group].find((p) => p.package === packageKey);
    if (listed) {
      listed.on = false;
      return next;
    }
  }
  const pkg = items.find((i): i is Package => i.kind === "package" && i.key === packageKey);
  if (pkg) next[groupFor(pkg, new Map(items.map((i) => [i.key, i])))].push({ package: packageKey, on: false });
  return next;
}

// Takes a package out of the context's lists altogether.
export function removeFromContext(context: Context, packageKey: string): Context {
  const next = structuredClone(context);
  for (const { group } of GROUPS) next[group] = next[group].filter((p) => p.package !== packageKey);
  return next;
}
