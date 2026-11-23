// A unit as it can be taken: its own entry with everything it inherits filled in.
// Inheritance (build-log Part B decision 13): a unit "based on" another (Link Key) stores only what
// differs. Options: "+X" adds to the inherited ones; the same name without "+" replaces the inherited
// option of that name; "None" removes them all; "-X" removes one. Rules: "add:X" adds, "replace~X"
// takes X out (what follows comes in); a plain list replaces the inherited one. Other fields: the
// nearest one written wins. Design: design/races-and-units.md §1 (extends: store only what differs).
//
// Patches (src/rules/patches.ts) are applied after the entry they change, in order.
//
// Pure: worked out on every read.

import type { Cost, Item, Limit, Option, OptionGroup, Options, Patch, PatchChange, Range, Slot, Stat, Stats, Term, Unit, UnitRow } from "../items/items";
import { changesTo, patchCost, patchList, patchOptions, patchStat, patchStats, stepText } from "../rules/patches";
import { matchName } from "../items/keys";

export type UnitAsTaken = {
  unit: Unit;
  chain: Unit[]; // the unit, then what it's based on …
  name: string;
  stats: Stats;
  save?: Stat;
  cost?: Cost;
  size?: Range;
  troopType?: { type: string; character: boolean };
  equipment: Term[];
  rules: Term[];
  slots: Slot[];
  slotRows: UnitRow[]; // command rows (Sergeant, Standard Bearer), nearest first
  options: OptionGroup[];
  rulesOptions: OptionGroup[];
  limits: Limit[];
  character: boolean;
  patched: string[]; // each patch step that changed it, in order: "Lances free: Empire Knights: Equipment Options Lances(0)"
};

// `patches` are the patches in play, in order (src/rules/patches.ts): each one changing a unit in the
// chain is applied straight after that unit's own entry, so a unit based on a patched one gets the
// change too, unless it writes that cell itself.
export function unitAsTaken(unit: Unit, items: Item[], patches: Patch[] = []): UnitAsTaken {
  const chain = inheritanceChain(unit, items);
  const rootFirst = [...chain].reverse();
  const t: UnitAsTaken = { unit, chain, name: unit.name, stats: {}, equipment: [], rules: [], slots: [], slotRows: [], options: [], rulesOptions: [], limits: [], character: false, patched: [] };

  for (const u of rootFirst) {
    const own = u.rows[0];
    t.stats = { ...t.stats, ...own.stats };
    t.save = own.save ?? t.save;
    t.cost = own.cost ?? t.cost;
    t.size = own.size ?? t.size;
    t.troopType = own.troopType ?? t.troopType;
    if (own.equipment.length > 0) t.equipment = own.equipment;
    t.rules = inheritRules(t.rules, own.rules);
    t.options = inheritOptions(t.options, own.equipmentOptions);
    t.rulesOptions = inheritOptions(t.rulesOptions, own.rulesOptions);
    if (own.slots) t.slots = own.slots.none ? [] : own.slots.slots;
    if (own.limits) t.limits = own.limits.none ? [] : own.limits.limits;
    const ownSlotRows = u.rows.slice(1).filter((r) => r.slotCode);
    t.slotRows = [...ownSlotRows, ...t.slotRows.filter((x) => !ownSlotRows.some((r) => r.slotCode === x.slotCode))];
    for (const { patch, change } of changesTo(u, patches)) {
      applyChange(t, change);
      t.patched.push(stepText(patch, change));
    }
  }
  t.character = t.troopType?.character ?? false;
  return t;
}

// One patch row on the unit's own line, or on one of its command rows.
function applyChange(t: UnitAsTaken, change: PatchChange): void {
  const c = change.unit;
  if (!c) return;
  if (change.row) {
    const at = t.slotRows.findIndex((r) => r.slotCode === change.row);
    const row: UnitRow = at >= 0 ? structuredClone(t.slotRows[at]) : { type: "Slots-Upgrade", slotCode: change.row, stats: {}, equipment: [], rules: [], statuses: [] };
    row.name = c.name ?? row.name;
    row.stats = patchStats(row.stats, c.stats);
    row.cost = patchCost(row.cost, c.cost);
    row.equipment = patchList(row.equipment, c.equipment);
    row.rules = patchList(row.rules, c.rules);
    if (c.equipmentOptions) row.equipmentOptions = { groups: patchOptions(row.equipmentOptions?.groups ?? [], c.equipmentOptions) };
    t.slotRows = at >= 0 ? t.slotRows.map((r, i) => (i === at ? row : r)) : [...t.slotRows, row];
    return;
  }
  t.stats = patchStats(t.stats, c.stats);
  if (c.save !== undefined) t.save = patchStat(t.save, c.save);
  t.cost = patchCost(t.cost, c.cost);
  t.size = c.size ?? t.size;
  t.troopType = c.troopType ?? t.troopType;
  t.equipment = patchList(t.equipment, c.equipment);
  t.rules = patchList(t.rules, c.rules);
  t.options = patchOptions(t.options, c.equipmentOptions);
  t.rulesOptions = patchOptions(t.rulesOptions, c.rulesOptions);
  if (c.slots) t.slots = c.slots.none ? [] : c.slots.slots;
  if (c.limits) t.limits = c.limits.none ? [] : c.limits.limits;
}

function inheritanceChain(unit: Unit, items: Item[]): Unit[] {
  const chain: Unit[] = [unit];
  let key = unit.inherits?.item;
  while (key) {
    const next = items.find((i) => i.key === key);
    if (next?.kind !== "unit" || chain.includes(next)) break;
    chain.push(next);
    key = next.inherits?.item;
  }
  return chain;
}

function inheritOptions(inherited: OptionGroup[], cell: Options | undefined): OptionGroup[] {
  if (!cell) return inherited;
  let groups = cell.removeAllInherited ? [] : structuredClone(inherited);
  for (const t of cell.removeInherited ?? []) groups = withoutOption(groups, t.name);
  for (const group of cell.groups) {
    const names = group.options.filter((o) => !o.addsToInherited).map((o) => matchName(o.name));
    for (const n of names) groups = withoutOption(groups, n);
    groups.push(structuredClone(group));
  }
  return groups.filter((g) => g.options.length > 0);
}

function withoutOption(groups: OptionGroup[], name: string): OptionGroup[] {
  return groups.map((g) => ({ ...g, options: g.options.filter((o) => matchName(o.name) !== matchName(name)) }));
}

function inheritRules(inherited: Term[], written: Term[]): Term[] {
  if (written.length === 0) return inherited;
  const changes = written.some((t) => t.change);
  if (!changes) return written;
  let rules = [...inherited];
  for (const t of written) {
    if (t.change === "replace" || t.change === "remove") rules = rules.filter((r) => !(matchName(r.name) === matchName(t.name) && r.detail === t.detail));
    else rules.push({ ...t, change: undefined });
  }
  return rules.map(({ change, ...rest }) => rest);
}

// How a pick names an option: its name, its own detail, and what it replaces.
// "Great Weapons", "Great Weapons instead of Shield", "Wizard (4)".
export function optionKey(option: Option): string {
  let key = option.name + (option.detail ? ` (${option.detail})` : "");
  if (option.replaces?.length) key += " instead of " + option.replaces.map((t) => t.name + (t.detail ? ` (${t.detail})` : "")).join(" or ");
  return key;
}
