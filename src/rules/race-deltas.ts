// A unit's stats as differences. Design: races-and-units.md §2 "Book entry: statlines entered as
// printed; the stored delta is printed − derived", so editing a race (or tree, or rank) flows down to
// every unit that draws on it; §1 "store only what differs, let changes flow down". Owner, 24 Nov:
// "the only time it's not a delta [to a race] is if there's no matching race, in which case it's a
// delta to 0". So every plain number on a unit is stored as a difference, from:
//   its race profile                    printed 4, Human WS 4   ->  { change: 0, asPrinted: true, against: "tow.race.human.core.base" }
//   nothing (no matching race)          printed 4               ->  { change: 4, asPrinted: true, against: "none" }
//   an upgrade slot row: the unit's line Sergeant printed BS 4, line BS 3 -> { change: 1, asPrinted: true, against: "line" }
//     (owner, 24 Nov: "slots entered as upgrades should delta to the unit rather than the race")
// A difference from "none" is moved onto the race once the race is on the device. Shown and
// downloaded as base + difference (as printed). "-", "3+" and text stay as entered.
//
// Pure.

import type { Item, RaceProfile, Stat, Stats, Unit, UnitRow } from "../items/items";
import { dimensionsOf, gameOf, profileKey } from "../items/race-dimensions";

type ByKey = Map<string, Item>;

// The race profile a row draws on. The unit's own line takes the nearest race cells up its
// inheritance chain. Its other rows (a champion, a standard bearer) inherit those cells from the unit
// and may set their own (a Rank) on top (owner, 24 Nov: "slots explicitly inherit human etc. from
// the unit"); a row naming a race of its own (a steed, crew) uses only its own cells.
export function raceOfRow(unit: Unit, rowIndex: number, items: Item[], byKey: ByKey = new Map(items.map((i) => [i.key, i]))): RaceProfile | undefined {
  const dims = dimensionsOf(gameOf(unit.key, items));
  const chain: Unit[] = [unit];
  for (let k = unit.inherits?.item; k; ) {
    const next = byKey.get(k);
    if (next?.kind !== "unit" || chain.includes(next)) break;
    chain.push(next);
    k = next.inherits?.item;
  }
  const unitProfile: Record<string, string> = Object.assign({}, ...[...chain].reverse().map((u) => u.rows[0].profile ?? {}));
  const own = rowIndex === 0 ? {} : unit.rows[rowIndex].profile ?? {};
  const profile = own[dims[0].name] ? own : { ...unitProfile, ...own };
  if (!profile[dims[0].name]) return undefined;
  const found = byKey.get(profileKey(unit.key.split(".")[0], profile, dims));
  return found?.kind === "race-profile" ? found : undefined;
}

// What a row's differences are from: an upgrade slot (a champion, a standard bearer) from the unit's
// own line as printed; any other row from its race profile; with no race, nothing (0).
type Base = { against: string; stats: Stats };
function baseOf(unit: Unit, rowIndex: number, items: Item[], byKey: ByKey): Base {
  const row = unit.rows[rowIndex];
  if (rowIndex > 0 && /upgrade/i.test(row.type) && !row.profile) return { against: "line", stats: printedRow(unit, 0, items, byKey) };
  const race = raceOfRow(unit, rowIndex, items, byKey);
  return race ? { against: race.key, stats: race.stats } : { against: "none", stats: {} };
}

const num = (s: Stat | undefined) => (typeof s === "number" ? s : 0); // "-" or no stat: 0

// Plain numbers to differences from the base; a difference from nothing moved onto a race now there.
function toDifferences(stats: Stats, base: Base): Stats {
  const out: Stats = {};
  for (const [name, stat] of Object.entries(stats)) {
    if (typeof stat === "number") out[name] = { change: stat - num(base.stats[name]), asPrinted: true, against: base.against };
    else if (stat.asPrinted && stat.against === "none" && base.against !== "none" && stat.change !== undefined)
      out[name] = { change: stat.change - num(base.stats[name]), asPrinted: true, against: base.against };
    else out[name] = stat;
  }
  return out;
}

function printedRow(unit: Unit, rowIndex: number, items: Item[], byKey: ByKey): Stats {
  const row = unit.rows[rowIndex];
  const base = baseOf(unit, rowIndex, items, byKey);
  const out: Stats = {};
  for (const [name, stat] of Object.entries(row.stats)) {
    if (typeof stat === "number" || !stat.asPrinted || stat.change === undefined) out[name] = stat;
    else out[name] = (stat.against === "none" ? 0 : num(base.stats[name])) + stat.change;
  }
  return out;
}

// Every unit's plain numbers stored as differences (run whenever the library changes, and on load).
export function unitsToDifferences(items: Item[]): Item[] {
  const byKey: ByKey = new Map(items.map((i) => [i.key, i]));
  return items.map((item) => {
    if (item.kind !== "unit") return item;
    let changed = false;
    const rows = item.rows.map((row, i): UnitRow => {
      const needs = Object.values(row.stats).some((s) => typeof s === "number" || (s.asPrinted && s.against === "none"));
      if (!needs) return row;
      const stats = toDifferences(row.stats, baseOf(item, i, items, byKey));
      if (JSON.stringify(stats) === JSON.stringify(row.stats)) return row;
      changed = true;
      return { ...row, stats };
    });
    return changed ? { ...item, rows } : item;
  });
}

// A unit with every row's stats as printed (for a card, a grid, a download).
export function unitAsPrinted(unit: Unit, items: Item[], byKey: ByKey = new Map(items.map((i) => [i.key, i]))): Unit {
  if (!unit.rows.some((r) => Object.values(r.stats).some((s) => typeof s !== "number" && s.asPrinted))) return unit;
  return { ...unit, rows: unit.rows.map((row, i) => ({ ...row, stats: printedRow(unit, i, items, byKey) })) };
}

// The base a difference is against has a new key (a race dimension renamed or added): follow it.
export function renameAgainst(item: Item, newKeys: Map<string, string>): Item {
  if (item.kind !== "unit") return item;
  const fix = (stats: Stats): Stats =>
    Object.fromEntries(Object.entries(stats).map(([n, s]) => [n, typeof s !== "number" && s.against && newKeys.has(s.against) ? { ...s, against: newKeys.get(s.against)! } : s]));
  return { ...item, rows: item.rows.map((r) => ({ ...r, stats: fix(r.stats) })) };
}
