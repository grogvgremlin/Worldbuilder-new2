// A roster worked out: what each unit costs and why, totals by category against the composition
// limits, and the issues. Building never blocks: an illegal roster is kept and its issues shown.
// Design: design/rosters.md §1–5 (a roster stores choices; the target is set up front);
// design/army-lists.md §3 (composition: percentages of the target; every set in reach applies, the
// tightest wins); design/validation-and-fixes.md §1–2 (issues: illegal, warning, notice).
// Build-log Part B decision 15 (limits: what~amount~per 1,000 of the roster target; an army rule wins
// over a unit's own); rebuild build log (composition sets chosen per context).
//
// Pure: a roster and the library in, a view out. Magic items and other allowances aren't picked yet.

import type { ArmyList, CompositionRule, Context, Cost, Item, Limit, OptionGroup, Roster, RosterUnit, SlotKind, Unit } from "../items/items";
import { matchName } from "../items/keys";
import { readContext } from "../context/context";
import { optionKey, unitAsTaken, type UnitAsTaken } from "./unit-as-taken";

export type Issue = { severity: "illegal" | "warning"; message: string; units: string[] };

// A choice the unit offers: an option in a group, or a command slot.
export type Choice = { pick: string; label: string; costText: string; cost?: Cost };
export type ChoiceGroup = { where: string; title: string; required: boolean; oneOf: boolean; choices: Choice[]; allowance?: string };

export type UnitView = {
  rosterUnit: RosterUnit;
  taken: UnitAsTaken | null;
  category: string;
  points: number;
  breakdown: string[]; // "10 × 7 = 70", "Handguns instead of Crossbow: 10 × 1 = 10", "Sergeant +5"
  choices: ChoiceGroup[];
  issues: Issue[];
};

export type CategoryView = { category: string; points: number; limit: string; ok: boolean };

export type RosterView = {
  roster: Roster;
  armyList: ArmyList | undefined;
  units: UnitView[];
  total: number;
  categories: CategoryView[];
  issues: Issue[]; // the roster's own (each unit's are on the unit too)
};

// --- What's in reach --------------------------------------------------------------------------

// Every item in a package switched on in the roster's context.
export function inReach(context: Context, items: Item[]): Item[] {
  const on = readContext(context, items).on;
  return items.filter((i) => i.homePackage !== undefined && on.has(i.homePackage));
}

// The army lists a context offers.
export function armyListsIn(context: Context, items: Item[]): ArmyList[] {
  return inReach(context, items).filter((i): i is ArmyList => i.kind === "army-list");
}

// --- The roster --------------------------------------------------------------------------------

export function viewRoster(roster: Roster, items: Item[]): RosterView {
  const context = items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const reach = context ? inReach(context, items) : [];
  const armyList = reach.find((i): i is ArmyList => i.kind === "army-list" && i.key === roster.armyList);
  const categoryOf = new Map((armyList?.entries ?? []).map((e) => [e.unit, e.category]));
  const slotKinds = new Map(reach.filter((i): i is SlotKind => i.kind === "slot-kind").map((s) => [s.code, s.name]));

  const units = roster.units.map((ru) => viewUnit(ru, reach, categoryOf, slotKinds));
  const total = units.reduce((n, u) => n + u.points, 0);
  const issues: Issue[] = [];
  if (!context) issues.push({ severity: "warning", message: "its pick-up game isn't on the device", units: [] });
  else if (!armyList) issues.push({ severity: "warning", message: "its army list isn't switched on in the game", units: [] });
  if (total > roster.target) issues.push({ severity: "illegal", message: `over the points limit: ${total} of ${roster.target}`, units: [] });

  const rules = compositionRules(armyList, reach);
  const categories = categoryTotals(units, rules, roster.target, issues);
  for (const rule of rules) for (const limit of rule.limits.limits) checkArmyLimit(rule.name, limit, units, roster.target, issues);
  checkEntryLimits(units, roster.target, issues);
  for (const u of units) issues.push(...u.issues);
  return { roster, armyList, units, total, categories, issues: dedupe(issues) };
}

function viewUnit(ru: RosterUnit, reach: Item[], categoryOf: Map<string, string>, slotKinds: Map<string, string>): UnitView {
  const unit = reach.find((i): i is Unit => i.kind === "unit" && i.key === ru.unit);
  const view: UnitView = { rosterUnit: ru, taken: null, category: categoryOf.get(ru.unit) ?? "Other", points: 0, breakdown: [], choices: [], issues: [] };
  if (!unit) {
    view.issues.push({ severity: "warning", message: "this unit isn't in any package switched on", units: [ru.id] });
    return view;
  }
  const taken = unitAsTaken(unit, reach);
  view.taken = taken;
  view.choices = choicesFor(taken, slotKinds);

  // The unit itself.
  if (taken.cost) {
    const each = taken.cost.points;
    const n = taken.cost.per === "model" ? ru.size : 1;
    view.points += each * n;
    view.breakdown.push(taken.cost.per === "model" ? `${ru.size} × ${each} = ${each * n}` : `${taken.name} ${each}`);
  }
  // What was picked.
  for (const pick of [...ru.slots.map((s) => `command|${s}`), ...ru.picks]) {
    const choice = findChoice(view.choices, pick);
    if (!choice) {
      view.issues.push({ severity: "warning", message: `“${pick.split("|")[1]}” isn't offered any more`, units: [ru.id] });
      continue;
    }
    const cost = choice.cost;
    if (!cost || cost.points === 0) continue;
    const n = cost.per === "model" ? ru.size : 1;
    view.points += cost.points * n;
    view.breakdown.push(cost.per === "model" ? `${choice.label}: ${ru.size} × ${cost.points} = ${cost.points * n}` : `${choice.label} +${cost.points}`);
  }
  view.issues.push(...unitIssues(ru, taken, view.choices));
  return view;
}

// --- Choices a unit offers ----------------------------------------------------------------------

function choicesFor(taken: UnitAsTaken, slotKinds: Map<string, string>): ChoiceGroup[] {
  const groups: ChoiceGroup[] = [];
  const command: Choice[] = [];
  for (const slot of taken.slots) {
    if (slot.type === "crew" || slot.type === "steed") continue; // comes with the unit
    const row = slot.fromUnitRows ? taken.slotRows.find((r) => r.slotCode === slot.code) : undefined;
    const name = row?.name ?? slotKinds.get(slot.code) ?? slot.code;
    const cost = row?.cost ?? slot.cost;
    command.push({ pick: `command|${name}`, label: name, costText: costText(cost), cost });
  }
  if (command.length) groups.push({ where: "command", title: "Command", required: false, oneOf: false, choices: command });
  taken.options.forEach((g, i) => groups.push(groupChoices(g, "options", i === 0 ? "Options" : "")));
  taken.rulesOptions.forEach((g) => groups.push(groupChoices(g, "rules options", "Special rules")));
  for (const row of taken.slotRows) {
    for (const g of row.equipmentOptions?.groups ?? []) groups.push(groupChoices(g, `slot:${row.name}`, `${row.name}`));
  }
  return groups.filter((g) => g.choices.length > 0 || g.allowance);
}

function groupChoices(group: OptionGroup, where: string, title: string): ChoiceGroup {
  const choices: Choice[] = [];
  let allowance: string | undefined;
  for (const option of group.options) {
    // An allowance to spend on items of a kind (Magic Items up to 50 pts): shown, not picked yet.
    if (option.budget) {
      allowance = `${option.name}: up to ${option.budget.max ?? "any"} pts (picking items comes later)`;
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

// How many a "per 1,000 points" limit allows at this target: per full 1,000 (build log: Q-C2 open).
function allowed(limit: Limit, target: number): { min: number | null; max: number | null } {
  const times = limit.perPoints ? Math.floor(target / limit.perPoints) : 1;
  return { min: limit.amount.min === null ? null : limit.amount.min * (limit.perPoints ? Math.max(times, 1) : 1), max: limit.amount.max === null ? null : limit.amount.max * times };
}

function checkArmyLimit(ruleName: string, limit: Limit, units: UnitView[], target: number, issues: Issue[]): void {
  if (limit.counts === "points") return; // category percentages: done above
  let counted: UnitView[] = [];
  if (limit.counts === "unit" && limit.of) counted = units.filter((u) => u.taken && limit.of!.some((n) => matchName(n) === matchName(u.taken!.name)));
  else if (limit.counts === "units") counted = units.filter((u) => passes(u, limit.where));
  else if (matchName(limit.counts) === "general") {
    counted = units.filter((u) => u.rosterUnit.general);
    for (const u of counted) if (limit.where?.toLowerCase().includes("character") && !u.taken?.character) issues.push({ severity: "illegal", message: `${u.taken?.name}: the General must be a character`, units: [u.rosterUnit.id] });
  } else return;
  report(ruleName, counted, allowed(limit, target), limit, issues);
}

// A unit's own limits: "unit~0-1~1000 roster target" (this entry), "rules options~0-1~…" (this entry
// taking any special-rule option). An army rule about the same units is checked as well; the
// tighter one shows.
function checkEntryLimits(units: UnitView[], target: number, issues: Issue[]): void {
  const byEntry = new Map<string, UnitView[]>();
  for (const u of units) if (u.taken) byEntry.set(u.taken.unit.key, [...(byEntry.get(u.taken.unit.key) ?? []), u]);
  for (const entry of byEntry.values()) {
    const taken = entry[0].taken!;
    for (const limit of taken.limits) {
      let counted: UnitView[] = [];
      if (limit.counts === "unit") counted = entry;
      else if (limit.counts === "rules options") counted = entry.filter((u) => u.rosterUnit.picks.some((p) => p.startsWith("rules options|")));
      else continue; // limits on a slot's items wait for magic items
      report(`${taken.name} (${limit.counts})`, counted, allowed(limit, target), limit, issues);
    }
  }
}

function report(what: string, counted: UnitView[], range: { min: number | null; max: number | null }, limit: Limit, issues: Issue[]): void {
  const n = counted.length;
  const per = limit.perPoints ? ` per ${limit.perPoints.toLocaleString("en-GB")} pts` : "";
  const amount = `${limit.amount.min ?? 0}${limit.amount.max === limit.amount.min ? "" : "–" + (limit.amount.max ?? "")}${per}`;
  if (range.max !== null && n > range.max) issues.push({ severity: "illegal", message: `${what}: ${n} taken, ${amount}`, units: counted.map((u) => u.rosterUnit.id) });
  if (range.min !== null && n < range.min) issues.push({ severity: "illegal", message: `${what}: ${n} taken, needs ${range.min}`, units: [] });
}

// The filter written in a limit's square brackets, e.g. "not Character; Troop Type not Swarm,War Beasts".
function passes(u: UnitView, where: string | undefined): boolean {
  if (!u.taken) return false;
  if (!where) return true;
  for (const part of where.split(";").map((p) => p.trim())) {
    if (/^not character$/i.test(part) && u.taken.character) return false;
    const m = /^troop type not (.+)$/i.exec(part);
    if (m && u.taken.troopType && m[1].split(",").some((t) => matchName(t) === matchName(u.taken!.troopType!.type))) return false;
  }
  return true;
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
  const taken = unitAsTaken(unit, items);
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
    const slots = ru.slots.includes(name) ? ru.slots.filter((s) => s !== name) : [...ru.slots, name];
    return updateUnit(roster, id, { slots });
  }
  const on = ru.picks.includes(choice.pick);
  let picks = ru.picks.filter((p) => p !== choice.pick);
  if (!on) {
    if (group.oneOf) picks = picks.filter((p) => !group.choices.some((c) => c.pick === p));
    picks.push(choice.pick);
  }
  return updateUnit(roster, id, { picks });
}
