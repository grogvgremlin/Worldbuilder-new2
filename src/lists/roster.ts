// A roster worked out: what each unit costs and why, totals by category against the composition
// limits, and the issues. Building never blocks: an illegal roster is kept and its issues shown.
// Design: design/rosters.md §1–5 (a roster stores choices; the target is set up front);
// design/army-lists.md §3 (composition: percentages of the target; every set in reach applies, the
// tightest wins); design/validation-and-fixes.md §1–2 (issues: illegal, warning, notice).
// Build-log Part B decision 15 (limits: what~amount~per 1,000 of the roster target; an army rule wins
// over a unit's own); rebuild build log (composition sets chosen per context).
//
// Pure: a roster and the library in, a view out. Magic items are picked through allowances
// (src/lists/magic-items.ts).

import type { ArmyList, CompositionRule, Context, Cost, Game, Item, Limit, MagicItem, OptionGroup, Patch, Roster, RosterUnit, SlotKind, Unit } from "../items/items";
import { applyScaling, limitMode, settingForLimit, settingValue, type LimitMode } from "../settings/settings";
import { matchName } from "../items/keys";
import { readContext } from "../context/context";
import { patched, patchesInPlay } from "../rules/patches";
import { optionKey, unitAsTaken, type UnitAsTaken } from "./unit-as-taken";
import { headingFor } from "../items/race-dimensions";
import { passesFilter, readFilter, type Filterable } from "./unit-filter";
import { itemPick, itemRuleIssues, itemsForAllowance, notForBearer, readItemPick, type PickedItem } from "./magic-items";

// `units`: the units it's about (marked on the list); `categories`: the army categories it's about
// (their headings go red), e.g. "no General" on Characters, "fewer than three units" on Core, Special, Rare.
// `about: "items"`: an issue about magic items (the item picker won't offer what would cause one).
export type Issue = { severity: "illegal" | "warning"; message: string; units: string[]; categories?: string[]; about?: "items" };

// A choice the unit offers: an option in a group, or a command slot.
// `blocked`: greyed out, and why (the limit mode "grey").
// `counted`: a command slot taken by a number of models rather than once (its most: null = any).
export type Choice = { pick: string; label: string; costText: string; cost?: Cost; blocked?: string; counted?: { most: number | null } };
// `full`: the group's limit is reached by other units, so its choices aren't offered here (the reason).
// An allowance: points to spend on items of some types ("Magic Items: up to 50 pts").
export type Allowance = { name: string; budget: number | null; most: number | null; text: string };
export type ChoiceGroup = { where: string; title: string; required: boolean; oneOf: boolean; choices: Choice[]; allowance?: Allowance; full?: string };

export type UnitView = {
  rosterUnit: RosterUnit;
  taken: UnitAsTaken | null;
  category: string;
  points: number;
  breakdown: string[]; // "10 × 7 = 70", "Handguns instead of Crossbow: 10 × 1 = 10", "Sergeant +5"
  choices: ChoiceGroup[];
  issues: Issue[];
  limits: string[]; // the limits on it, in words, with how many are taken: "This entry: 0–1 per 1,000 pts · 1 taken, at most 1 at 1,000 pts"
};

export type CategoryView = { category: string; points: number; limit: string; ok: boolean };

export type RosterView = {
  roster: Roster;
  armyList: ArmyList | undefined;
  units: UnitView[];
  total: number;
  categories: CategoryView[];
  issues: Issue[]; // the roster's own (each unit's are on the unit too)
  full: Record<string, string>; // entries that can't be added now (their limit is reached): unit key -> why
  generalFull?: string; // the General role is taken as often as allowed: why another can't be (owner, 23 Nov)
  limitMode: LimitMode; // what to do with a choice over a limit: hide it, grey it out, or allow it with a warning
};

// --- What's in reach --------------------------------------------------------------------------

// Every item in a package switched on in the roster's context.
// A card switched off in the set-up isn't; equipment, rules and composition rules come with the
// patches in play already made (units take theirs in unitAsTaken, after their own entry).
export function inReach(context: Context, items: Item[], patches: Patch[] = patchesInPlay(context, items).applied): Item[] {
  const on = readContext(context, items).on;
  const off = new Set(context.off ?? []);
  return items.filter((i) => i.homePackage !== undefined && on.has(i.homePackage) && !off.has(i.key)).map((i) => patched(i, patches));
}

// The army lists a context offers.
export function armyListsIn(context: Context, items: Item[]): ArmyList[] {
  return inReach(context, items).filter((i): i is ArmyList => i.kind === "army-list");
}

// --- The roster --------------------------------------------------------------------------------

export function viewRoster(roster: Roster, items: Item[]): RosterView {
  const context = items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const patches = context ? patchesInPlay(context, items).applied : [];
  const reach = context ? inReach(context, items, patches) : [];
  const armyList = reach.find((i): i is ArmyList => i.kind === "army-list" && i.key === roster.armyList);
  const categoryOf = new Map((armyList?.entries ?? []).map((e) => [e.unit, e.category]));
  const slotKinds = new Map(reach.filter((i): i is SlotKind => i.kind === "slot-kind").map((s) => [s.code, s.name]));

  const gameHere = items.find((i): i is Game => i.kind === "game" && i.shortName === context?.game);
  const heading = (column: string) => headingFor(gameHere, column);
  const units = roster.units.map((ru) => viewUnit(ru, reach, patches, categoryOf, slotKinds, heading));
  const total = units.reduce((n, u) => n + u.points, 0);
  const issues: Issue[] = [];
  if (!context) issues.push({ severity: "warning", message: "its pick-up game isn't on the device", units: [] });
  else if (!armyList) issues.push({ severity: "warning", message: "its army list isn't switched on in the game", units: [] });
  if (total > roster.target) issues.push({ severity: "illegal", message: `over the points limit: ${total} of ${roster.target}`, units: [] });

  const rules = compositionRules(armyList, reach);
  const categories = categoryTotals(units, rules, roster.target, issues);
  const game = items.find((i): i is Game => i.kind === "game" && i.shortName === context?.game);
  const allowed = allowedBy(game, items, context, roster, issues);
  const entries = entryUnits(armyList, reach, patches);
  for (const rule of rules) for (const limit of rule.limits.limits) checkArmyLimit(rule.name, limit, units, entries, allowed, roster.target, issues);
  const mode = limitMode(game, items, context, roster);
  checkEntryLimits(units, allowed, roster.target, issues, mode);
  for (const found of itemRuleIssues(pickedItems(units, reach), rules)) issues.push({ severity: "illegal", ...found, about: "items" });
  const full = fullEntries(rules, units, entries, allowed, roster.target);
  describeLimits(units, rules, allowed, roster.target);
  for (const u of units) issues.push(...u.issues);
  return { roster, armyList, units, total, categories, issues: dedupe(issues), full, generalFull: generalFull(rules, units, allowed), limitMode: mode };
}

function viewUnit(ru: RosterUnit, reach: Item[], patches: Patch[], categoryOf: Map<string, string>, slotKinds: Map<string, string>, heading: (column: string) => string): UnitView {
  const unit = reach.find((i): i is Unit => i.kind === "unit" && i.key === ru.unit);
  const view: UnitView = { rosterUnit: ru, taken: null, category: categoryOf.get(ru.unit) ?? "Other", points: 0, breakdown: [], choices: [], issues: [], limits: [] };
  if (!unit) {
    view.issues.push({ severity: "warning", message: "this unit isn't in any package switched on", units: [ru.id] });
    return view;
  }
  const taken = unitAsTaken(unit, reach, patches);
  view.taken = taken;
  view.choices = choicesFor(taken, slotKinds, heading);

  // The unit itself.
  if (taken.cost) {
    const each = taken.cost.points;
    const n = taken.cost.per === "model" ? ru.size : 1;
    view.points += each * n;
    view.breakdown.push(taken.cost.per === "model" ? `${ru.size} × ${each} = ${each * n}` : `${taken.name} ${each}`);
  }
  // What was picked.
  for (const pick of [...ru.slots.map((s) => `command|${s}`), ...ru.picks.filter((p) => !readItemPick(p))]) {
    const choice = findChoice(view.choices, pick);
    if (!choice) {
      view.issues.push({ severity: "warning", message: `“${pick.split("|")[1]}” isn't offered any more`, units: [ru.id] });
      continue;
    }
    const cost = choice.cost;
    if (choice.counted) view.issues.push(...countIssues(ru, choice));
    if (!cost || cost.points === 0) continue;
    if (choice.counted) {
      const n = slotCount(ru, choice.label);
      view.points += cost.points * n;
      view.breakdown.push(`${choice.label}: ${n} × ${cost.points} = ${cost.points * n}`);
      continue;
    }
    const n = cost.per === "model" ? ru.size : 1;
    view.points += cost.points * n;
    view.breakdown.push(cost.per === "model" ? `${choice.label}: ${ru.size} × ${cost.points} = ${cost.points * n}` : `${choice.label} +${cost.points}`);
  }
  costItems(view, reach);
  view.issues.push(...unitIssues(ru, taken, view.choices));
  return view;
}

// How many models take a command slot (1 unless counted).
export function slotCount(ru: RosterUnit, name: string): number {
  return ru.slotCounts?.[name] ?? 1;
}

// A counted slot can't have more models than the unit, or than its most.
function countIssues(ru: RosterUnit, choice: Choice): Issue[] {
  const n = slotCount(ru, choice.label);
  const most = choice.counted?.most ?? null;
  const out: Issue[] = [];
  if (n > ru.size) out.push({ severity: "illegal", message: `${n} ${choice.label}s in a unit of ${ru.size}`, units: [ru.id] });
  if (most !== null && n > most) out.push({ severity: "illegal", message: `${n} ${choice.label}s, at most ${most}`, units: [ru.id] });
  return out;
}

// The magic items picked: each costed, and each allowance kept to its budget and number of items.
function costItems(view: UnitView, reach: Item[]): void {
  const ru = view.rosterUnit;
  const spent = new Map<string, { allowance: Allowance; points: number; count: number }>();
  for (const pick of ru.picks) {
    const p = readItemPick(pick);
    if (!p) continue;
    const group = view.choices.find((g) => g.where === p.where && g.allowance?.name === p.allowance);
    const slotOff = p.where.startsWith("slot:") && !ru.slots.includes(p.where.slice(5));
    const item = reach.find((i): i is MagicItem => i.kind === "magic-item" && i.key === p.itemKey);
    if (!group || slotOff || !item) {
      view.issues.push({ severity: "warning", message: `“${item?.name ?? p.itemKey}” isn't offered any more (${p.allowance})`, units: [ru.id] });
      continue;
    }
    const points = item.cost?.points ?? 0;
    view.points += points;
    view.breakdown.push(`${item.name}${p.where.startsWith("slot:") ? ` (${p.where.slice(5)})` : ""} ${points}`);
    const key = `${p.where}|${p.allowance}`;
    const s = spent.get(key) ?? { allowance: group.allowance!, points: 0, count: 0 };
    spent.set(key, { ...s, points: s.points + points, count: s.count + 1 });
  }
  for (const [key, s] of spent) {
    const who = key.startsWith("slot:") ? ` (${key.split("|")[0].slice(5)})` : "";
    if (s.allowance.budget !== null && s.points > s.allowance.budget) view.issues.push({ severity: "illegal", message: `${view.taken?.name}${who}: ${s.points} pts of ${s.allowance.name}, up to ${s.allowance.budget}`, units: [ru.id], about: "items" });
    if (s.allowance.most !== null && s.count > s.allowance.most) view.issues.push({ severity: "illegal", message: `${view.taken?.name}${who}: ${s.count} ${s.allowance.name}, at most ${s.allowance.most}`, units: [ru.id], about: "items" });
  }
}

// When the limits on the General ("General[Character]~1~army") are reached: why no other unit may be.
function generalFull(rules: CompositionRule[], units: UnitView[], allowed: Allowed): string | undefined {
  const n = units.filter((u) => u.rosterUnit.general).length;
  for (const rule of rules)
    for (const limit of rule.limits.limits.filter((l) => matchName(l.counts) === "general")) {
      const max = allowed(limit).max;
      if (max !== null && n >= max) return `${rule.name}: ${n} taken, at most ${max}`;
    }
  return undefined;
}

// Every magic item picked in the list, with who bears it.
function pickedItems(units: UnitView[], reach: Item[]): PickedItem[] {
  const out: PickedItem[] = [];
  for (const u of units)
    for (const pick of u.rosterUnit.picks) {
      const p = readItemPick(pick);
      const item = p && reach.find((i): i is MagicItem => i.kind === "magic-item" && i.key === p.itemKey);
      if (p && item) out.push({ unitId: u.rosterUnit.id, bearer: `${u.rosterUnit.id}|${p.where}`, item });
    }
  return out;
}

// --- Choices a unit offers ----------------------------------------------------------------------

// Each group's title is its column's heading: the column's own name unless the game renames it
// (TOW: Slots -> Command, Equipment Options -> Options, Rules Options -> Special rules).
function choicesFor(taken: UnitAsTaken, slotKinds: Map<string, string>, heading: (column: string) => string): ChoiceGroup[] {
  const groups: ChoiceGroup[] = [];
  const command: Choice[] = [];
  for (const slot of taken.slots) {
    if (slot.type === "crew" || slot.type === "steed") continue; // comes with the unit
    const row = slot.fromUnitRows ? taken.slotRows.find((r) => r.slotCode === slot.code) : undefined;
    const name = row?.name ?? slotKinds.get(slot.code) ?? slot.code;
    const cost = row?.cost ?? slot.cost;
    const range = slot.count ?? row?.size; // "GS(0-;upgrade;+7)", or the row's Min/Max
    const counted = range && range.max !== 1 ? { most: range.max } : undefined;
    command.push({ pick: `command|${name}`, label: name, costText: costText(cost) + (counted ? " each" : ""), cost, counted });
  }
  if (command.length) groups.push({ where: "command", title: heading("Slots"), required: false, oneOf: false, choices: command });
  taken.options.forEach((g, i) => groups.push(groupChoices(g, "options", i === 0 ? heading("Equipment Options") : "")));
  taken.rulesOptions.forEach((g) => groups.push(groupChoices(g, "rules options", heading("Rules Options"))));
  for (const row of taken.slotRows) {
    for (const g of row.equipmentOptions?.groups ?? []) groups.push(groupChoices(g, `slot:${row.name}`, `${row.name}`));
  }
  return groups.filter((g) => g.choices.length > 0 || g.allowance);
}

function groupChoices(group: OptionGroup, where: string, title: string): ChoiceGroup {
  const choices: Choice[] = [];
  let allowance: Allowance | undefined;
  for (const option of group.options) {
    // An allowance to spend on items of some types (Magic Items up to 50 pts): items are picked for it.
    if (option.budget) {
      const most = option.count?.max ?? null;
      allowance = { name: option.name, budget: option.budget.max, most, text: `${option.name}: ${option.budget.max === null ? "any points" : `up to ${option.budget.max} pts`}${most === 1 ? ", one item" : most !== null ? `, up to ${most} items` : ""}` };
      continue;
    }
    choices.push({ pick: `${where}|${optionKey(option)}`, label: optionKey(option), costText: costText(option.cost), cost: option.cost });
  }
  return { where, title, required: group.required, oneOf: group.options.length > 1, choices, allowance };
}

function findChoice(groups: ChoiceGroup[], pick: string): Choice | null {
  for (const g of groups) {
    const choice = g.choices.find((c) => c.pick === pick);
    if (choice) return choice;
  }
  return null;
}

function costText(cost: Cost | undefined): string {
  if (!cost) return "";
  if (cost.points === 0) return "free";
  return `${cost.adds ? "+" : ""}${cost.points}${cost.per === "model" ? " per model" : ""}`;
}

// --- Issues on one unit -------------------------------------------------------------------------

function unitIssues(ru: RosterUnit, taken: UnitAsTaken, groups: ChoiceGroup[]): Issue[] {
  const issues: Issue[] = [];
  const at = (message: string): Issue => ({ severity: "illegal", message: `${taken.name}: ${message}`, units: [ru.id] });
  const { size } = taken;
  if (size?.min !== null && size?.min !== undefined && ru.size < size.min) issues.push(at(`at least ${size.min} models`));
  if (size?.max !== null && size?.max !== undefined && ru.size > size.max) issues.push(at(`at most ${size.max} models`));
  for (const g of groups) {
    if (g.where.startsWith("slot:") && !ru.slots.includes(g.where.slice(5))) continue; // only if that slot's taken
    const picked = g.choices.filter((c) => ru.picks.includes(c.pick) || ru.slots.includes(c.pick.split("|")[1]) && g.where === "command");
    if (g.required && picked.length === 0) issues.push(at(`choose one of ${g.choices.map((c) => c.label).join(", ")}`));
    if (g.oneOf && picked.length > 1) issues.push(at(`only one of ${g.choices.map((c) => c.label).join(", ")}`));
  }
  if (ru.general && !taken.character) issues.push(at("only a character can be the General"));
  return issues;
}

// --- Composition --------------------------------------------------------------------------------

// The army list's own rules, and every composition rule in a package switched on (the context's
// composition sets, the book-wide rules).
function compositionRules(armyList: ArmyList | undefined, reach: Item[]): CompositionRule[] {
  const own = new Set(armyList?.composition ?? []);
  const all = reach.filter((i): i is CompositionRule => i.kind === "composition-rule");
  const listsElsewhere = reach.filter((i): i is ArmyList => i.kind === "army-list" && i.key !== armyList?.key).flatMap((l) => l.composition);
  // Another army list's own rules don't apply to this one.
  return all.filter((r) => own.has(r.key) || !listsElsewhere.includes(r.key));
}

function categoryTotals(units: UnitView[], rules: CompositionRule[], target: number, issues: Issue[]): CategoryView[] {
  const views: CategoryView[] = [];
  for (const rule of rules) {
    if (!rule.category) continue;
    for (const limit of rule.limits.limits.filter((l) => l.counts === "points")) {
      const inCategory = units.filter((u) => u.category === rule.category);
      const points = inCategory.reduce((n, u) => n + u.points, 0);
      const { min, max } = bounds(limit, target);
      const ok = (min === null || points >= min) && (max === null || points <= max);
      const limitText = limit.percent ? percentText(limit) : `${min ?? 0}–${max ?? "any"}`;
      views.push({ category: rule.category, points, limit: limitText + (min !== null || max !== null ? ` (${[min !== null ? `at least ${min}` : "", max !== null ? `up to ${max}` : ""].filter(Boolean).join(", ")})` : ""), ok });
      // A category short or over is the list's issue, not any one unit's.
      if (!ok) issues.push({ severity: "illegal", message: `${rule.category}: ${points} pts, ${limitText}`, units: [] });
    }
  }
  return views;
}

function percentText(limit: Limit): string {
  const { min, max } = limit.amount;
  if (min !== null && max !== null) return `${min}–${max}%`;
  return min !== null ? `at least ${min}%` : `up to ${max}%`;
}

// Points bounds for a limit at this target: a minimum rounds up, a maximum rounds down.
function bounds(limit: Limit, target: number): { min: number | null; max: number | null } {
  const scale = (n: number | null, round: (x: number) => number) => (n === null ? null : limit.percent ? round((n * target) / 100) : n);
  return { min: scale(limit.amount.min, Math.ceil), max: scale(limit.amount.max, Math.floor) };
}

// How many a limit allows at this target. A "per 1,000 points" limit reads the game's setting of
// that name, from the most specific place that sets it (src/settings/settings.ts); with no setting,
// full thousands.
// `setting`: the setting that scaled it, when it isn't the game's default ("Per 1,000 points:
// full(target / 100), set in this set-up"), so a card can say where a surprising number comes from.
type Allowed = (limit: Limit) => { min: number | null; max: number | null; setting?: string };

function allowedBy(game: Game | undefined, items: Item[], context: Context | undefined, roster: Roster, issues: Issue[]): Allowed {
  return (limit) => {
    const name = settingForLimit(limit.perPoints, limit.basis);
    if (!name) return limit.amount;
    const found = settingValue(name, game, items, context, roster);
    const value = found?.value ?? (limit.perPoints ? `full(target / ${limit.perPoints})` : null);
    if (!value) {
      issues.push({ severity: "warning", message: `no setting called “${name}”: the limit is read as written`, units: [] });
      return limit.amount;
    }
    const scaled = applyScaling(value, roster.target, limit.amount);
    if ("error" in scaled) {
      issues.push({ severity: "warning", message: `${name} (${found?.from}): ${scaled.error}`, units: [] });
      return limit.amount;
    }
    const setting = found && found.from !== "the game's default" ? `${name}: ${found.value}, set in ${found.from}` : undefined;
    return { ...scaled, setting };
  };
}

// Every entry of the army list as it can be taken, with its category: what a limit's filter is
// checked against when no unit of that entry is in the list yet.
type Entry = Filterable & { key: string; limits: Limit[] };

function entryUnits(armyList: ArmyList | undefined, reach: Item[], patches: Patch[]): Entry[] {
  const out: Entry[] = [];
  for (const e of armyList?.entries ?? []) {
    const unit = reach.find((i): i is Unit => i.kind === "unit" && i.key === e.unit);
    if (!unit) continue;
    const taken = unitAsTaken(unit, reach, patches);
    out.push({ ...filterable(taken, e.category), key: unit.key, limits: taken.limits });
  }
  return out;
}

// Entries whose limit is already reached, so another can't be added (owner, 23 Nov: "the second
// shouldn't even be an option"): the entry's own "unit~0-1~…", or an army rule naming it, unit(A,B).
function fullEntries(rules: CompositionRule[], units: UnitView[], entries: Entry[], allowed: Allowed, target: number): Record<string, string> {
  const full: Record<string, string> = {};
  const mark = (keys: string[], what: string, n: number, limit: Limit) => {
    const range = allowed(limit);
    if (range.max === null || n < range.max) return;
    for (const key of keys) full[key] ??= `${what}: ${n} taken, ${allowedText(range.max, limit, target)}`;
  };
  for (const e of entries)
    for (const limit of e.limits.filter((l) => l.counts === "unit"))
      mark([e.key], e.name, units.filter((u) => u.rosterUnit.unit === e.key).length, limit);
  for (const rule of rules)
    for (const limit of rule.limits.limits.filter((l) => l.counts === "unit" && l.of)) {
      const named = (name: string) => limit.of!.some((n) => matchName(n) === matchName(name));
      const n = units.filter((u) => u.taken && named(u.taken.name)).length;
      mark(entries.filter((e) => named(e.name)).map((e) => e.key), rule.name, n, limit);
    }
  return full;
}

function filterable(taken: UnitAsTaken, category: string): Filterable {
  return { name: taken.name, character: taken.character, troopType: taken.troopType?.type, category, rules: taken.rules.map((r) => r.name) };
}

function checkArmyLimit(ruleName: string, limit: Limit, units: UnitView[], entries: Entry[], allowed: Allowed, target: number, issues: Issue[]): void {
  if (limit.counts === "points") return; // category percentages: done above
  const countsUnits = limit.counts === "unit" || limit.counts === "units" || matchName(limit.counts) === "general";
  if (!countsUnits) return; // magic items and the like: checked elsewhere
  const filter = readFilter(limit.where);
  for (const problem of filter.problems) issues.push({ severity: "warning", message: `${ruleName}: ${problem}`, units: [] });
  const passes = (f: Filterable) => passesFilter(f, filter) && (!limit.of || limit.of.some((n) => matchName(n) === matchName(f.name)));
  const asFilterable = (u: UnitView) => (u.taken ? filterable(u.taken, u.category) : null);
  let counted: UnitView[];
  if (limit.counts === "unit" && !limit.of) return; // "unit" names its entries: unit(A,B)
  if (limit.counts === "unit" || limit.counts === "units") counted = units.filter((u) => asFilterable(u) && passes(asFilterable(u)!));
  else if (matchName(limit.counts) === "general") counted = units.filter((u) => u.rosterUnit.general);
  else return;
  // The categories it's about: those holding entries it could count.
  const categories = [...new Set(entries.filter(passes).map((e) => e.category))];
  if (matchName(limit.counts) === "general")
    for (const u of counted) {
      const f = asFilterable(u);
      if (f && !passesFilter(f, filter)) issues.push({ severity: "illegal", message: `${u.taken?.name}: the General must be ${limit.where}`, units: [u.rosterUnit.id] });
    }
  report(ruleName, counted, allowed(limit), limit, target, issues, categories);
}

// A unit's own limits: "unit~0-1~1000 roster target" (this entry), "rules options~0-1~…" (this entry
// taking any special-rule option). An army rule about the same units is checked as well; the
// tighter one shows.
function checkEntryLimits(units: UnitView[], allowed: Allowed, target: number, issues: Issue[], mode: LimitMode): void {
  const byEntry = new Map<string, UnitView[]>();
  for (const u of units) if (u.taken) byEntry.set(u.taken.unit.key, [...(byEntry.get(u.taken.unit.key) ?? []), u]);
  for (const entry of byEntry.values()) {
    const taken = entry[0].taken!;
    for (const limit of taken.limits) {
      let counted: UnitView[] = [];
      if (limit.counts === "unit") counted = entry;
      else if (limit.counts === "rules options") counted = entry.filter((u) => u.rosterUnit.picks.some((p) => p.startsWith("rules options|")));
      else if (limit.of) counted = entry.filter((u) => hasSlotItem(u, limit.counts, limit.of!)); // SB(Magic Standard): units whose SB took one
      else continue;
      const range = allowed(limit);
      const what = limit.counts === "rules options" ? `${taken.name} with a special rule option` : taken.name;
      report(what, counted, range, limit, target, issues);
      // Full: the other units of this entry aren't offered its special-rule options any more.
      if (limit.counts === "rules options" && range.max !== null && counted.length >= range.max)
        for (const u of entry.filter((x) => !counted.includes(x))) {
          const groups = u.choices.filter((c) => c.where === "rules options");
          if (groups.length === 0) continue;
          const labels = groups.flatMap((g) => g.choices.map((c) => c.label)).join(", ");
          const why = `${counted.length ? "already taken by another unit" : "none allowed"}, ${allowedText(range.max, limit, target)}`;
          // The limit mode: hide the choices, grey them out, or leave them with a warning.
          if (mode === "hide") {
            groups[0].full = `${labels}: ${why}`;
            for (const g of groups) g.choices = [];
          } else if (mode === "grey") {
            groups[0].full = `${labels}: ${why}`;
            for (const g of groups) for (const c of g.choices) c.blocked = why;
          } else groups[0].full = `⚠ ${labels}: ${why} (allowed here, but the list will show an issue)`;
        }
    }
  }
}

// Has this unit's command row with this code (SB) taken an item through one of these allowances?
function hasSlotItem(u: UnitView, code: string, allowances: string[]): boolean {
  const rowName = u.taken?.slotRows.find((r) => matchName(r.slotCode ?? "") === matchName(code))?.name;
  return !!rowName && u.rosterUnit.picks.some((pick) => {
    const p = readItemPick(pick);
    return !!p && p.where === `slot:${rowName}` && allowances.some((a) => matchName(a) === matchName(p.allowance));
  });
}

function report(what: string, counted: UnitView[], range: { min: number | null; max: number | null }, limit: Limit, target: number, issues: Issue[], categories: string[] = []): void {
  const n = counted.length;
  if (range.max !== null && n > range.max) issues.push({ severity: "illegal", message: `${what}: ${n} taken, ${allowedText(range.max, limit, target)}`, units: counted.map((u) => u.rosterUnit.id), categories });
  if (range.min !== null && n < range.min) issues.push({ severity: "illegal", message: `${what}: ${n} taken, needs ${range.min}`, units: [], categories });
}

// Each unit's limits in words, for its card (owner, 23 Nov: "limits and such like in the units"):
// its entry's own, and army rules that name it.
function describeLimits(units: UnitView[], rules: CompositionRule[], allowed: Allowed, target: number): void {
  for (const u of units) {
    if (!u.taken) continue;
    const sameEntry = units.filter((x) => x.taken?.unit.key === u.taken!.unit.key);
    const line = (label: string, limit: Limit, n: number | null) => {
      const { max, setting } = allowed(limit);
      const now = n === null ? "not checked yet" : `${n} taken${max !== null ? `, ${allowedText(max, limit, target)}` : ""}`;
      u.limits.push(`${label}: ${amountText(limit)} · ${now}${setting ? ` (${setting})` : ""}`);
    };
    for (const limit of u.taken.limits) {
      if (limit.counts === "unit") line("This entry", limit, sameEntry.length);
      else if (limit.counts === "rules options") line("Units with a special rule option", limit, sameEntry.filter((x) => x.rosterUnit.picks.some((p) => p.startsWith("rules options|"))).length);
      else if (limit.of) line(`${limit.counts} (${limit.of.join(", ")})`, limit, sameEntry.filter((x) => hasSlotItem(x, limit.counts, limit.of!)).length);
      else line(limit.counts, limit, null);
    }
    for (const rule of rules)
      for (const limit of rule.limits.limits.filter((l) => l.counts === "unit" && l.of?.some((n) => matchName(n) === matchName(u.taken!.name)))) {
        const named = (name: string) => limit.of!.some((n) => matchName(n) === matchName(name));
        line(`${rule.name} (${limit.of!.join(", ")})`, limit, units.filter((x) => x.taken && named(x.taken.name)).length);
      }
  }
}

// "0–1 per 1,000 pts", "3", "at least 3".
function amountText(limit: Limit): string {
  const { min, max } = limit.amount;
  const amount = min !== null && max !== null ? (min === max ? `${min}` : `${min}–${max}`) : min !== null ? `at least ${min}` : `up to ${max}`;
  return amount + (limit.perPoints ? ` per ${limit.perPoints.toLocaleString("en-GB")} pts` : "");
}

// "at most 1 at 1,000 pts (0–1 per 1,000 pts)"; "at most 3".
function allowedText(max: number, limit: Limit, target: number): string {
  if (!limit.perPoints) return `at most ${max}`;
  return `at most ${max} at ${target.toLocaleString("en-GB")} pts (${amountText(limit)})`;
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)));
}

// --- Changing a roster ----------------------------------------------------------------------------

export function newRoster(name: string, context: Context, armyList: ArmyList, target: number, items: Item[]): Roster {
  const taken = new Set(items.map((i) => i.key));
  const base = `roster.${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list"}`;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return { key, kind: "roster", name, context: context.key, armyList: armyList.key, target, units: [] };
}

// Adds a unit at its smallest size, with any required choice that has only one option taken.
export function addUnit(roster: Roster, unit: Unit, items: Item[]): Roster {
  const context = items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const taken = unitAsTaken(unit, items, context ? patchesInPlay(context, items).applied : []);
  const size = taken.size?.min ?? 1;
  let n = roster.units.length + 1;
  while (roster.units.some((u) => u.id === `u${n}`)) n++;
  return { ...roster, units: [...roster.units, { id: `u${n}`, unit: unit.key, size, picks: [], slots: [], general: false }] };
}

export function updateUnit(roster: Roster, id: string, change: Partial<RosterUnit>): Roster {
  return { ...roster, units: roster.units.map((u) => (u.id === id ? { ...u, ...change } : u)) };
}

export function removeUnit(roster: Roster, id: string): Roster {
  return { ...roster, units: roster.units.filter((u) => u.id !== id) };
}

// Ticks or unticks a choice; in a one-of group, ticking one unticks the others.
export function toggleChoice(roster: Roster, id: string, group: ChoiceGroup, choice: Choice): Roster {
  const ru = roster.units.find((u) => u.id === id);
  if (!ru) return roster;
  if (group.where === "command") {
    const name = choice.pick.split("|")[1];
    const off = ru.slots.includes(name);
    const slots = off ? ru.slots.filter((s) => s !== name) : [...ru.slots, name];
    // Taking a command model off takes its magic items off too.
    const picks = off ? ru.picks.filter((p) => !p.startsWith(`item:slot:${name}|`)) : ru.picks;
    return updateUnit(roster, id, { slots, picks });
  }
  const on = ru.picks.includes(choice.pick);
  let picks = ru.picks.filter((p) => p !== choice.pick);
  if (!on) {
    if (group.oneOf) picks = picks.filter((p) => !group.choices.some((c) => c.pick === p));
    picks.push(choice.pick);
  }
  return updateUnit(roster, id, { picks });
}

// Sets how many models take a counted command slot: 0 takes it off (with its items).
export function setSlotCount(roster: Roster, id: string, name: string, n: number): Roster {
  const ru = roster.units.find((u) => u.id === id);
  if (!ru) return roster;
  const counts = { ...(ru.slotCounts ?? {}) };
  delete counts[name];
  if (n <= 0) {
    const picks = ru.picks.filter((p) => !p.startsWith(`item:slot:${name}|`));
    return updateUnit(roster, id, { slots: ru.slots.filter((s) => s !== name), picks, slotCounts: Object.keys(counts).length ? counts : undefined });
  }
  if (n > 1) counts[name] = n;
  const slots = ru.slots.includes(name) ? ru.slots : [...ru.slots, name];
  return updateUnit(roster, id, { slots, slotCounts: Object.keys(counts).length ? counts : undefined });
}

// --- Picking magic items --------------------------------------------------------------------------

export type ItemChoice = { item: MagicItem; picked: boolean; why?: string }; // why: not offered, and the reason

// The items an allowance offers this unit, each with whether it's picked and, if it can't be added,
// why: it isn't for this bearer, it's over the budget, or a magic-item rule would be broken.
export function itemChoices(roster: Roster, items: Item[], unitId: string, where: string, allowanceName: string): ItemChoice[] {
  const view = viewRoster(roster, items);
  const u = view.units.find((x) => x.rosterUnit.id === unitId);
  const group = u?.choices.find((g) => g.where === where && g.allowance?.name === allowanceName);
  const context = items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  if (!u?.taken || !group?.allowance || !context) return [];
  const reach = inReach(context, items);
  const mine = u.rosterUnit.picks.filter((p) => p.startsWith(`item:${where}|${allowanceName}|`));
  const spent = mine.reduce((n, p) => n + ((reach.find((i) => i.key === readItemPick(p)!.itemKey) as MagicItem | undefined)?.cost?.points ?? 0), 0);
  const row = where.startsWith("slot:") ? u.taken.slotRows.find((r) => r.name === where.slice(5)) : undefined;
  const bearer = { name: row?.name ?? u.taken.name, rules: u.taken.rules.map((r) => r.name), troopType: u.taken.troopType?.type };
  const before = new Set(view.issues.filter((i) => i.about === "items").map((i) => i.message));
  return itemsForAllowance(allowanceName, reach).map((item) => {
    const pick = itemPick(where, allowanceName, item.key);
    if (u.rosterUnit.picks.includes(pick)) return { item, picked: true };
    const notFor = notForBearer(item, bearer);
    if (notFor) return { item, picked: false, why: notFor };
    const cost = item.cost?.points ?? 0;
    const { budget, most } = group.allowance!;
    if (budget !== null && spent + cost > budget) return { item, picked: false, why: `${spent + cost} pts would be over ${budget}` };
    if (most !== null && mine.length >= most) return { item, picked: false, why: most === 1 ? "one item only: take the other off first" : `at most ${most} items` };
    const tried = withPick(roster, unitId, pick);
    const broken = viewRoster(tried, items.map((i) => (i.key === roster.key ? tried : i))).issues.find((i) => i.about === "items" && !before.has(i.message));
    return broken ? { item, picked: false, why: broken.message } : { item, picked: false };
  });
}

function withPick(roster: Roster, unitId: string, pick: string): Roster {
  return { ...roster, units: roster.units.map((u) => (u.id === unitId ? { ...u, picks: [...u.picks, pick] } : u)) };
}

// Takes an item, or takes it off.
export function toggleItem(roster: Roster, unitId: string, where: string, allowanceName: string, itemKey: string): Roster {
  const pick = itemPick(where, allowanceName, itemKey);
  const ru = roster.units.find((u) => u.id === unitId);
  if (!ru) return roster;
  return updateUnit(roster, unitId, { picks: ru.picks.includes(pick) ? ru.picks.filter((p) => p !== pick) : [...ru.picks, pick] });
}
