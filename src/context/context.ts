// A context: a game and the packages switched on for it. What's on, what each package brings with it,
// what can still be switched on, and anything that looks wrong.
// Design: design/v2-reconciliation.md §1 (build rows: four groups, each in order — books → FAQs →
// house rules → campaign, each package in the group its layer says; the game brings its core, which
// can't be switched off whole); design/army-lists.md §3 (composition packages); owner, 22 Nov: another
// game's package never comes in, and being part of a book doesn't load the book;
// build-log Part B decisions 21 (switching a package on brings what it needs, marked "needed by";
// derived, not stored; a needed package switched off by hand stays off, with a warning), 26 (only the
// context's game is offered), 29 (a pick-up game: no world, so no campaign packages).
//
// Pure: a context and the library in, a view out. Switching things on and off returns a new context.

import { PICKUP, type Context, type ContextPackage, type Game, type GamePreset, type Item, type Package, type Sandbox } from "../items/items";
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

// The permanent Pick-up sandbox: no world features. Made if it isn't there.
export function pickupSandbox(): Sandbox {
  return { key: PICKUP, kind: "sandbox", name: "Pick-up", world: false, permanent: true };
}

// Whether a context's sandbox has world features (so campaign packages can go in it).
export function inWorld(context: Context, items: Item[]): boolean {
  const sandbox = items.find((i): i is Sandbox => i.kind === "sandbox" && i.key === (context.sandbox ?? PICKUP));
  return sandbox?.world ?? false;
}

// A new context for a game: its core always on, its default composition set chosen.
export function newContext(name: string, game: Game, items: Item[], sandbox: string = PICKUP): Context {
  const taken = new Set(items.map((i) => i.key));
  let key = `context.${slug(name) || "game"}`;
  for (let n = 2; taken.has(key); n++) key = `context.${slug(name) || "game"}-${n}`;
  const context: Context = { key, kind: "context", name, game: game.shortName, sandbox, books: [], faqs: [], house: [], campaign: [], composition: [] };
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
    if (pkg.game !== context.game) return; // another game's package never comes in
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
  // Each listed package is read in the group its layer says, whatever list it was written in.
  const listedByGroup = new Map<Group, ContextPackage[]>(GROUPS.map(({ group }) => [group, []]));
  for (const listed of allListed(context)) {
    const pkg = byKey.get(listed.package);
    const group = pkg?.kind === "package" ? groupFor(pkg, byKey) : "books";
    listedByGroup.get(group)!.push(listed);
  }
  for (const { group } of GROUPS) {
    for (const listed of listedByGroup.get(group)!) {
      const pkg = byKey.get(listed.package);
      if (pkg?.kind === "package" && pkg.game !== context.game) continue;
      if (listed.on) add(listed.package, "chosen", null, []);
      else if (!seen.has(listed.package)) order.push({ key: listed.package, name: byKey.get(listed.package)?.name ?? listed.package, how: "chosen", on: false, neededBy: [] });
    }
  }

  if (!inWorld(context, items)) for (const listed of listedByGroup.get("campaign")!) warnings.push(`${byKey.get(listed.package)?.name ?? listed.package} is a campaign package: campaign rules need a world`);
  if (!context.composition.some((c) => c.on)) warnings.push("no composition set: only the army lists' own limits apply");

  return { game, packages: order, on: new Set(order.filter((p) => p.on).map((p) => p.key)), warnings };
}

// What a package needs: what it says it needs, and the packages its items name. Being part of a book
// is only where it shows in the Library: it never loads the book, nor the book's other armies (owner, 22 Nov).
export function needsOf(pkg: Package, items: Item[]): string[] {
  const needs = [...pkg.needsStated];
  for (const k of foundNeeds(pkg, items).keys()) needs.push(k);
  return [...new Set(needs)];
}

function allListed(context: Context): ContextPackage[] {
  return GROUPS.flatMap(({ group }) => context[group]);
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
    if (group === "campaign" && !inWorld(context, items)) continue;
    out.set(group, [...(out.get(group) ?? []), pkg]);
  }
  return out;
}

// Switches a package on, in the group it belongs to (listed again if it was switched off). A book
// brings the latest FAQ that corrects it, unless an FAQ for it is already listed (owner, 22 Nov).
export function switchOn(context: Context, packageKey: string, items: Item[]): Context {
  const pkg = items.find((i): i is Package => i.kind === "package" && i.key === packageKey);
  if (!pkg || pkg.game !== context.game) return context; // only this game's packages
  const group = groupFor(pkg, new Map(items.map((i) => [i.key, i])));
  let next = structuredClone(context);
  const listed = next[group].find((p) => p.package === packageKey);
  if (listed) listed.on = true;
  else next[group].push({ package: packageKey, on: true });
  if (group === "books") {
    const faqs = faqsFor(packageKey, items);
    const latest = faqs[faqs.length - 1];
    if (latest && !next.faqs.some((f) => faqs.some((x) => x.key === f.package))) next = switchOn(next, latest.key, items);
  }
  return next;
}

// The FAQs that correct a package, oldest first by version (numbers compared part by part: 1.2 before 1.10).
export function faqsFor(packageKey: string, items: Item[]): Package[] {
  return items
    .filter((i): i is Package => i.kind === "package" && i.layer === "faq" && i.corrects === packageKey)
    .sort((a, b) => compareVersions(a.version, b.version));
}

function compareVersions(a: string | undefined, b: string | undefined): number {
  const pa = (a ?? "").split(/[.\-]/).map((x) => Number(x) || 0);
  const pb = (b ?? "").split(/[.\-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

// --- Presets and copies -----------------------------------------------------------------------

// A new context from one of the game's presets. Names not loaded yet come back as `missing`.
export function fromPreset(name: string, game: Game, preset: GamePreset | null, items: Item[]): { context: Context; missing: string[] } {
  let context = newContext(name, game, items);
  if (!preset) return { context, missing: [] };
  const packages = items.filter((i): i is Package => i.kind === "package" && i.game === game.shortName && !i.stubsFor);
  const missing: string[] = [];
  const find = (n: string) => {
    const p = packages.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (!p) missing.push(n);
    return p;
  };
  for (const n of preset.books ?? []) {
    const book = find(n);
    if (!book) continue;
    context = switchOn(context, book.key, items);
    if (preset.armies === "all") for (const army of packages.filter((p) => p.partOf === book.key)) context = switchOn(context, army.key, items);
  }
  for (const n of [...(preset.faqs ?? []), ...(preset.house ?? [])]) {
    const p = find(n);
    if (p) context = switchOn(context, p.key, items);
  }
  if (preset.composition) {
    context.composition = [];
    for (const n of preset.composition) {
      const p = find(n);
      if (p) context.composition.push({ package: p.key, on: true });
    }
  }
  if (preset.settings) context.settings = { ...preset.settings };
  return { context, missing };
}

// A copy of a context (packages and settings; not its lists), under a new name.
export function copyContext(context: Context, items: Item[]): Context {
  const game = items.find((i): i is Game => i.kind === "game" && i.shortName === context.game);
  const fresh = game ? newContext(`${context.name} (copy)`, game, items, context.sandbox) : { ...context };
  return { ...structuredClone(context), key: fresh.key, name: `${context.name} (copy)` };
}

// Chooses the composition sets: exactly these on (the basic dropdown picks one, or none).
export function chooseComposition(context: Context, packageKeys: string[]): Context {
  return { ...context, composition: packageKeys.map((k) => ({ package: k, on: true })) };
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

// Moves a package up or down within its group's list (a later one applies after an earlier one).
export function moveInContext(context: Context, packageKey: string, by: -1 | 1): Context {
  const next = structuredClone(context);
  for (const { group } of GROUPS) {
    const list = next[group];
    const at = list.findIndex((p) => p.package === packageKey);
    if (at < 0) continue;
    const to = at + by;
    if (to < 0 || to >= list.length) return context;
    [list[at], list[to]] = [list[to], list[at]];
    return next;
  }
  return context;
}
