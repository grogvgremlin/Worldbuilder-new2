// The race grid as a table, any way round (owner, 23 Nov): pick the dimensions down the side, what
// runs across (every stat, or one dimension showing one stat), and an "only" value for the rest.
//   Race × Rank, every stat:  down Race, Rank; across Stats
//   Race × Tree, WS:          down Race; across Tree; stat WS
// A dimension that's neither down, across nor narrowed to one value is added down the side, so each
// cell is one profile. Pure.

import type { RaceDimension, RaceProfile } from "../items/items";
import { placeIn } from "../items/race-dimensions";
import { writeStat } from "../notation/values";

export type TableChoice = { down: string[]; across: string; stat: string; only: Record<string, string> }; // across: "Stats" or a dimension
export type TableRow = { label: string[]; cells: string[]; keys: (string | undefined)[] };
export type Table = { labelColumns: string[]; columns: string[]; rows: TableRow[] };

export function raceTable(profiles: RaceProfile[], dims: RaceDimension[], stats: string[], choice: TableChoice): Table {
  const at = (p: RaceProfile, dim: string) => placeIn(p.profile, dims)[dims.findIndex((d) => d.name === dim)];
  const kept = profiles.filter((p) => Object.entries(choice.only).every(([d, v]) => !v || at(p, d) === v));
  const narrowed = new Set(Object.entries(choice.only).filter(([, v]) => v).map(([d]) => d));
  const across = choice.across === "Stats" ? null : choice.across;
  const down = [...choice.down, ...dims.map((d) => d.name).filter((d) => !choice.down.includes(d) && d !== across && !narrowed.has(d))];
  const rowKey = (p: RaceProfile) => down.map((d) => at(p, d)).join("|");
  const rowKeys = [...new Set(kept.map(rowKey))];

  if (!across) {
    return {
      labelColumns: down,
      columns: stats,
      rows: rowKeys.map((k) => {
        const p = kept.find((x) => rowKey(x) === k)!;
        return { label: down.map((d) => at(p, d)), cells: stats.map((s) => writeStat(p.stats[s])), keys: stats.map(() => p.key) };
      }),
    };
  }
  const columns = [...new Set(kept.map((p) => at(p, across)))];
  return {
    labelColumns: down,
    columns,
    rows: rowKeys.map((k) => {
      const inRow = kept.filter((x) => rowKey(x) === k);
      const cellFor = (c: string) => inRow.find((p) => at(p, across) === c);
      return { label: down.map((d) => at(inRow[0], d)), cells: columns.map((c) => writeStat(cellFor(c)?.stats[choice.stat])), keys: columns.map((c) => cellFor(c)?.key) };
    }),
  };
}

// The values each dimension takes, for the "only" choices.
export function valuesOf(profiles: RaceProfile[], dims: RaceDimension[], dim: string): string[] {
  const i = dims.findIndex((d) => d.name === dim);
  return [...new Set(profiles.map((p) => placeIn(p.profile, dims)[i]))];
}
