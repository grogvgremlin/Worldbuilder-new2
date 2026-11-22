// A unit as it can be taken: its own entry with everything it inherits filled in.
// Inheritance (build-log Part B decision 13): a unit "based on" another (Link Key) stores only what
// differs. Options: "+X" adds to the inherited ones; the same name without "+" replaces the inherited
// option of that name; "None" removes them all; "-X" removes one. Rules: "add:X" adds, "replace~X"
// takes X out (what follows comes in); a plain list replaces the inherited one. Other fields: the
// nearest one written wins. Design: design/races-and-units.md §1 (extends: store only what differs).
//
// Pure: worked out on every read.

import type { Cost, Item, Limit, Option, OptionGroup, Options, Range, Slot, Term, Unit, UnitRow } from "../items/items";
import { matchName } from "../items/keys";

export type UnitAsTaken = {
  unit: Unit;
  chain: Unit[]; // the unit, then what it's based on …
  name: string;
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
};

export function unitAsTaken(unit: Unit, items: Item[]): UnitAsTaken {
  const chain = inheritanceChain(unit, items);
  const rootFirst = [...chain].reverse();
  const own = (pick: (r: UnitRow) => unknown) => chain.map((u) => pick(u.rows[0])).find((v) => v !== undefined);

  let options: OptionGroup[] = [];
  let rulesOptions: OptionGroup[] = [];
  let rules: Term[] = [];
  for (const u of rootFirst) {
    options = inheritOptions(options, u.rows[0].equipmentOptions);
    rulesOptions = inheritOptions(rulesOptions, u.rows[0].rulesOptions);
    rules = inheritRules(rules, u.rows[0].rules);
  }
  const slotsCell = chain.map((u) => u.rows[0].slots).find((s) => s !== undefined);
  const slotRows: UnitRow[] = [];
  for (const u of chain) for (const r of u.rows.slice(1)) if (r.slotCode && !slotRows.some((x) => x.slotCode === r.slotCode)) slotRows.push(r);
  const troopType = own((r) => r.troopType) as UnitAsTaken["troopType"];
  const equipment = (chain.map((u) => u.rows[0].equipment).find((e) => e.length > 0) ?? []) as Term[];
  const limitsCell = chain.map((u) => u.rows[0].limits).find((l) => l !== undefined);
  return {
    unit,
    chain,
    name: unit.name,
    cost: own((r) => r.cost) as Cost | undefined,
    size: own((r) => r.size) as Range | undefined,
    troopType,
    equipment,
    rules,
    slots: slotsCell && !slotsCell.none ? slotsCell.slots : [],
    slotRows,
    options,
    rulesOptions,
    limits: limitsCell && !limitsCell.none ? limitsCell.limits : [],
    character: troopType?.character ?? false,
  };
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
