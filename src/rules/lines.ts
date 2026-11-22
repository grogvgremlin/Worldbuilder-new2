// A unit's profile lines worked out from what was entered: the race cell, the unit it's based on,
// the line as entered (a printed value wins; a change is added), and kit that changes its bearer
// (barding: M −1). Slot rows start from the unit's line; a mount's line is worked out from its own card.
// Design: design/races-and-units.md §1 (extends: store only what differs), §2 (race base → axes →
// the unit's delta; entered as printed), §5 (mounts). Build-log Part B decisions 3, 12–13, 17.
//
// Pure, and worked out on every read: nothing here is stored. Every line says how it was made.

import type { Equipment, Item, RaceProfile, Stat, Stats, Term, Unit, UnitRow } from "../items/items";
import { itemKey } from "../items/keys";

export const STATS = ["M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];

export type Value = number | "-";
export type Line = Record<string, Value>;

export type WorkedLine = {
  name: string;
  kind: "model" | "slot" | "mount";
  line: Line;
  steps: string[]; // how it was made, in order, in plain words
  differs: string[]; // where the entered line differs from what the race cell gives ("WS +1")
};

export function workOutLines(unit: Unit, items: Item[]): WorkedLine[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const chain = inheritanceChain(unit, byKey);
  const own = workOutOwnLine(unit, chain, byKey);
  const lines: WorkedLine[] = [own];
  for (const row of unit.rows.slice(1)) {
    if (row.race) {
      // Crew and steeds have their own race: a line of their own (one crewman; a steed).
      const alone: Unit = { ...unit, inherits: undefined, rows: [row] };
      lines.push({ ...workOutOwnLine(alone, [alone], byKey), kind: "mount" });
    } else if (Object.keys(row.stats).length > 0) lines.push(workOutSlotLine(row, own));
  }
  for (const term of ownEquipment(chain)) {
    const mount = term.as === "Mount" && term.item ? byKey.get(term.item) : undefined;
    if (mount?.kind === "unit") {
      const line = workOutOwnLine(mount, inheritanceChain(mount, byKey), byKey);
      lines.push({ ...line, name: term.name, kind: "mount" });
    }
  }
  return lines;
}

// The unit, then the unit it's based on, and so on (cycles stop the walk).
function inheritanceChain(unit: Unit, byKey: Map<string, Item>): Unit[] {
  const chain: Unit[] = [unit];
  let next = unit.inherits?.item ? byKey.get(unit.inherits.item) : undefined;
  while (next?.kind === "unit" && !chain.includes(next)) {
    chain.push(next);
    next = next.inherits?.item ? byKey.get(next.inherits.item) : undefined;
  }
  return chain;
}

// A field from the nearest unit in the chain that has it.
function nearest<T>(chain: Unit[], pick: (row: UnitRow) => T | undefined): T | undefined {
  for (const u of chain) {
    const value = pick(u.rows[0]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function ownEquipment(chain: Unit[]): Term[] {
  return nearest(chain, (r) => (r.equipment.length > 0 ? r.equipment : undefined)) ?? [];
}

function workOutOwnLine(unit: Unit, chain: Unit[], byKey: Map<string, Item>): WorkedLine {
  const steps: string[] = [];
  const line: Line = {};
  const race = nearest(chain, (r) => r.race);
  const tree = nearest(chain, (r) => r.tree) ?? "Core";
  const rank = nearest(chain, (r) => r.rank) ?? "Base";
  const cell = race ? (byKey.get(itemKey(unit.key.split(".")[0], "race-profile", race, tree, rank)) as RaceProfile | undefined) : undefined;
  if (cell) {
    for (const s of STATS) if (cell.stats[s] !== undefined) line[s] = applyStat(undefined, cell.stats[s]);
    steps.push(`${cell.name}: ${show(line)}`);
  } else if (race) steps.push(`no race cell ${race} · ${tree} · ${rank}: the line as entered`);
  const fromRace: Line = { ...line };

  // As entered, from the furthest unit in the chain to this one: a nearer entry wins.
  for (const u of [...chain].reverse()) {
    const entered = u.rows[0].stats;
    if (Object.keys(entered).length === 0) continue;
    for (const s of STATS) if (entered[s] !== undefined) line[s] = applyStat(line[s], entered[s]);
    steps.push(`${u === unit ? "as entered" : `from ${u.name}`}: ${show(line)}`);
  }
  const differs = STATS.filter((s) => cell && line[s] !== fromRace[s]).map((s) => `${s} ${difference(fromRace[s], line[s])}`);

  for (const term of ownEquipment(chain)) {
    const kit = term.item ? byKey.get(term.item) : undefined;
    if (kit?.kind !== "equipment" || (kit as Equipment).type?.includes("weapon")) continue;
    const changes = plainChanges(kit.stats);
    if (changes.length === 0) continue;
    for (const [s, n] of changes) if (typeof line[s] === "number") line[s] = (line[s] as number) + n;
    steps.push(`${kit.name}: ${changes.map(([s, n]) => `${s} ${n > 0 ? "+" : ""}${n}`).join(", ")}`);
  }
  return { name: unit.rows[0].name ?? unit.name, kind: "model", line, steps, differs };
}

function workOutSlotLine(row: UnitRow, own: WorkedLine): WorkedLine {
  const line: Line = { ...own.line };
  const changes: string[] = [];
  for (const s of STATS) {
    const stat = row.stats[s];
    if (stat === undefined) continue;
    line[s] = applyStat(line[s], stat);
    changes.push(`${s} ${difference(own.line[s], line[s])}`);
  }
  const steps = [`${own.name}'s line`, ...(changes.length ? [`${row.name ?? row.type}: ${changes.join(", ")}`] : [])];
  return { name: row.name ?? row.type, kind: "slot", line, steps, differs: changes };
}

// One entered stat on top of a value: a printed number replaces it, a change is added, "-" is none.
function applyStat(current: Value | undefined, stat: Stat): Value {
  if (typeof stat === "number") return stat;
  if (stat.none) return "-";
  if (stat.value !== undefined) return stat.value;
  if (stat.change !== undefined && !stat.when) return typeof current === "number" ? current + stat.change : stat.change;
  return current ?? "-";
}

// Changes that always apply (not "+2 when charging", not a rider's bonus).
function plainChanges(stats: Stats): [string, number][] {
  const out: [string, number][] = [];
  for (const s of STATS) {
    const stat = stats[s];
    if (stat !== undefined && typeof stat !== "number" && stat.change !== undefined && !stat.when) out.push([s, stat.change]);
  }
  return out;
}

function difference(from: Value | undefined, to: Value | undefined): string {
  if (typeof from === "number" && typeof to === "number") return to - from >= 0 ? `+${to - from}` : String(to - from);
  return `= ${to ?? "-"}`;
}

function show(line: Line): string {
  return STATS.map((s) => line[s] ?? "·").join(" ");
}
