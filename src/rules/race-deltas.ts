// A unit's stats against its race profile. Design: races-and-units.md §2 "Book entry: statlines
// entered as printed; the stored delta is printed − derived", so editing a race (or tree, or rank)
// flows down to every unit that draws on it; §1 "store only what differs, let changes flow down".
//   In:   printed 4 against Human · Professional · Veteran WS 4  ->  { change: 0, asPrinted: true }
//   Out:  race WS 4 + change 0 -> 4 (on cards, in grids, in downloads: back as printed)
// Only plain numbers are turned into differences; "-", "3+", text stay as entered.
//
// Pure.

import type { Item, RaceProfile, Stat, Stats, Unit, UnitRow } from "../items/items";
import { dimensionsOf, gameOf, profileKey } from "../items/race-dimensions";

// The race profile a row draws on: the unit's own line takes the nearest race cells up its
// inheritance chain; any other row (crew, a steed) only its own.
export function raceOfRow(unit: Unit, rowIndex: number, items: Item[], byKey = new Map(items.map((i) => [i.key, i]))): RaceProfile | undefined {
  let profile: Record<string, string> = {};
  if (rowIndex === 0) {
    const chain: Unit[] = [unit];
    for (let k = unit.inherits?.item; k; ) {
      const next = byKey.get(k);
      if (next?.kind !== "unit" || chain.includes(next)) break;
      chain.push(next);
      k = next.inherits?.item;
    }
    profile = Object.assign({}, ...[...chain].reverse().map((u) => u.rows[0].profile ?? {}));
  } else profile = unit.rows[rowIndex].profile ?? {};
  const game = gameOf(unit.key, items);
  const dims = dimensionsOf(game);
  if (!profile[dims[0].name]) return undefined;
  const found = byKey.get(profileKey(unit.key.split(".")[0], profile, dims));
  return found?.kind === "race-profile" ? found : undefined;
}

// Printed numbers stored as differences from the race; anything else left as it is.
export function toDifferences(stats: Stats, race: RaceProfile): Stats {
  const out: Stats = {};
  for (const [name, stat] of Object.entries(stats)) {
    const base = race.stats[name];
    out[name] = typeof stat === "number" && typeof base === "number" ? { change: stat - base, asPrinted: true } : stat;
  }
  return out;
}

// Back to as printed: race + difference.
export function toPrinted(stats: Stats, race: RaceProfile | undefined): Stats {
  const out: Stats = {};
  for (const [name, stat] of Object.entries(stats)) out[name] = printed(stat, race?.stats[name]);
  return out;
}

function printed(stat: Stat, base: Stat | undefined): Stat {
  if (typeof stat === "number" || !stat.asPrinted || stat.change === undefined) return stat;
  return typeof base === "number" ? base + stat.change : { change: stat.change }; // no race on the device: the difference as a change
}

// Every unit's printed stats turned into differences from its race (rows whose race is on the device).
// Run whenever the library changes; a stat already a difference stays one.
export function unitsToDifferences(items: Item[]): Item[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return items.map((item) => {
    if (item.kind !== "unit") return item;
    let changed = false;
    const rows = item.rows.map((row, i): UnitRow => {
      if (!Object.values(row.stats).some((s) => typeof s === "number")) return row;
      const race = raceOfRow(item, i, items, byKey);
      if (!race) return row;
      changed = true;
      return { ...row, stats: toDifferences(row.stats, race) };
    });
    return changed ? { ...item, rows } : item;
  });
}

// A unit with every row's stats as printed (for a card, a grid, a download).
export function unitAsPrinted(unit: Unit, items: Item[], byKey = new Map(items.map((i) => [i.key, i]))): Unit {
  if (!unit.rows.some((r) => Object.values(r.stats).some((s) => typeof s !== "number" && s.asPrinted))) return unit;
  return { ...unit, rows: unit.rows.map((row, i) => ({ ...row, stats: toPrinted(row.stats, raceOfRow(unit, i, items, byKey)) })) };
}
