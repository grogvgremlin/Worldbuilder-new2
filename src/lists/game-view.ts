// A list as you'd want it at the table (owner, 24 Nov; after the Old World Builder's game view): for
// each unit, its stat lines (its own, the command models taken, its mount), its kit with the options
// taken, its special rules with those taken and given, its magic items, its page, and how a battle is
// going. Filters choose what shows. Pure: a roster view and the library in.
// Design: design/rosters.md §4 (views of a roster are derived, never stored).

import type { Game, Item, MagicItem, RaceProfile, Roster, SpecialRule, Stats, Term, Unit } from "../items/items";
import { dimensionsOf, gameOf, profileKey } from "../items/race-dimensions";
import { readItemPick } from "./magic-items";
import { patchStats } from "../rules/patches";
import { unitAsTaken } from "./unit-as-taken";
import type { RosterView, UnitView } from "./roster";
import { inReach } from "./roster";
import { matchName } from "../items/keys";
import { settingValue } from "../settings/settings";

export type StatLine = { name: string; stats: Stats };
export type RuleRef = { name: string; key?: string; text?: string };
export type GameUnit = {
  id: string;
  name: string;
  size: number;
  points: number;
  category: string;
  general: boolean;
  lines: StatLine[];
  equipment: string[];
  rules: RuleRef[];
  items: { name: string; type: string; bearer: string; key: string }[];
  command: string[];
  page?: string;
  note?: string;
  state?: "fleeing" | "dead";
};

export function gameUnits(view: RosterView, items: Item[]): GameUnit[] {
  const context = items.find((i) => i.kind === "context" && i.key === view.roster.context);
  const reach = context?.kind === "context" ? inReach(context, items) : items;
  return view.units.filter((u) => u.taken).map((u) => gameUnit(u, view.roster, reach));
}

function gameUnit(u: UnitView, roster: Roster, reach: Item[]): GameUnit {
  const t = u.taken!;
  const ru = u.rosterUnit;
  const ruleText = (term: Term): RuleRef => {
    const rule = reach.find((i): i is SpecialRule => i.kind === "special-rule" && (i.key === term.item || matchName(i.name) === matchName(term.name)));
    return { name: term.name + (term.detail ? ` (${term.detail})` : ""), key: rule?.key, text: rule?.text };
  };

  // Stat lines: the unit's own, each command model taken (its changes applied), each mount.
  const own = t.unit.rows[0].name ?? t.name;
  const base = withRace(t.unit, t.stats, reach);
  const lines: StatLine[] = [{ name: own, stats: base }];
  for (const row of t.slotRows) if (row.name && ru.slots.includes(row.name) && Object.keys(row.stats).length) lines.push({ name: row.name, stats: patchStats(base, row.stats) });

  // What was picked, by its label: "options|Lances", "rules options|Drilled".
  const picked = ru.picks.filter((p) => !readItemPick(p));
  const pickedOptions = u.choices.flatMap((g) => g.choices.filter((c) => picked.includes(c.pick)).map((c) => ({ group: g, choice: c })));
  const mounts: Term[] = [...t.equipment.filter((e) => e.as === "Mount")];
  for (const { group, choice } of pickedOptions) {
    if (group.where === "rules options") continue;
    const option = t.options.flatMap((og) => og.options).find((o) => choice.label.startsWith(o.name));
    if (option?.as === "Mount") mounts.push(option);
  }
  for (const m of mounts) {
    const mount = reach.find((i): i is Unit => i.kind === "unit" && (i.key === m.item || matchName(i.name) === matchName(m.name)));
    if (mount) lines.push({ name: mount.rows[0].name ?? mount.name, stats: withRace(mount, unitAsTaken(mount, reach).stats, reach) });
  }

  // Kit: what it comes with (less mounts and anything an option replaced), then options taken.
  const replaced = new Set<string>();
  const optionNames: string[] = [];
  const grants: Term[] = [];
  for (const { group, choice } of pickedOptions) {
    if (group.where === "rules options") continue;
    const option = t.options.flatMap((og) => og.options).find((o) => choice.label.startsWith(o.name));
    if (option?.as === "Mount") continue;
    for (const r of option?.replaces ?? []) replaced.add(matchName(r.name));
    grants.push(...(option?.grants ?? []).filter((g) => g.name !== "Troop Type"));
    optionNames.push(option?.name ?? choice.label);
  }
  const equipment = [...t.equipment.filter((e) => e.as !== "Mount" && !replaced.has(matchName(e.name))).map((e) => e.name + (e.detail ? ` (${e.detail})` : "")), ...optionNames];

  // Rules: its own, the special-rule options taken, and what options give.
  const rulesTaken = pickedOptions.filter(({ group }) => group.where === "rules options").map(({ choice }) => ({ name: choice.label }) as Term);
  const rules = [...t.rules, ...rulesTaken, ...grants].map(ruleText);

  const items = ru.picks
    .map(readItemPick)
    .filter((p) => p !== null)
    .map((p) => {
      const item = reach.find((i): i is MagicItem => i.kind === "magic-item" && i.key === p!.itemKey);
      return item ? { name: item.name, type: item.type, bearer: p!.where.startsWith("slot:") ? p!.where.slice(5) : "", key: item.key } : null;
    })
    .filter((x): x is GameUnit["items"][number] => x !== null);

  const ref = t.unit.rows[0].reference ?? t.unit.reference;
  return {
    id: ru.id,
    name: t.name,
    size: ru.size,
    points: u.points,
    category: u.category,
    general: ru.general,
    lines,
    equipment,
    rules,
    items,
    command: ru.slots,
    page: ref ? (ref.page ? `${ref.source} p. ${ref.page}` : ref.source) : undefined,
    note: ru.note,
    state: roster.battle?.units[ru.id],
  };
}

// A unit's stats on top of its race profile's: a horse entered with no stats of its own takes the
// Horse profile's; a unit's own values replace the profile's ("+1" changes it).
function withRace(unit: Unit, stats: Stats, reach: Item[]): Stats {
  const chain: Unit[] = [unit];
  for (let k = unit.inherits?.item; k; ) {
    const next = reach.find((i): i is Unit => i.kind === "unit" && i.key === k);
    if (!next || chain.includes(next)) break;
    chain.push(next);
    k = next.inherits?.item;
  }
  const profile: Record<string, string> = Object.assign({}, ...[...chain].reverse().map((u) => u.rows[0].profile ?? {}));
  const dims = dimensionsOf(gameOf(unit.key, reach) ?? (reach.find((i) => i.kind === "game") as Game | undefined));
  if (!profile[dims[0].name]) return stats;
  const race = reach.find((i): i is RaceProfile => i.kind === "race-profile" && i.key === profileKey(unit.key.split(".")[0], profile, dims));
  return race ? patchStats(race.stats, stats) : stats;
}

// --- The battle ---------------------------------------------------------------------------------

export type BattleTally = { destroyed: number; fleeing: number; scenario: number; banners: number; generalLost: boolean; bsbLost: boolean; extra: { label: string; points: number }[]; total: number };

// Points this list has given up so far (scenario points, the list's own, are kept apart): each unit dead or fled, at its points. The General, the Battle Standard and
// captured banners score what the game's settings say ("Victory points: General", "Victory points:
// Battle Standard Bearer", "Victory points: banner"); without those settings they're counted, not scored.
export function battleTally(view: RosterView, items: Item[]): BattleTally {
  const b = view.roster.battle ?? { units: {}, generalLost: false, bsbLost: false, banners: 0, scenario: 0 };
  const points = (state: string) => view.units.filter((u) => b.units[u.rosterUnit.id] === state).reduce((n, u) => n + u.points, 0);
  const context = items.find((i) => i.kind === "context" && i.key === view.roster.context);
  const game = items.find((i) => i.kind === "game" && context?.kind === "context" && i.shortName === context.game);
  const vp = (name: string) => {
    const v = settingValue(name, game?.kind === "game" ? game : undefined, items, context?.kind === "context" ? context : undefined, view.roster)?.value;
    return v !== undefined && /^\d+$/.test(v) ? Number(v) : null;
  };
  const extra: BattleTally["extra"] = [];
  const general = vp("Victory points: General");
  const bsb = vp("Victory points: Battle Standard Bearer");
  const banner = vp("Victory points: banner");
  if (b.generalLost && general !== null) extra.push({ label: "General lost", points: general });
  if (b.bsbLost && bsb !== null) extra.push({ label: "Battle Standard Bearer lost", points: bsb });
  if (b.banners && banner !== null) extra.push({ label: `${b.banners} banner${b.banners > 1 ? "s" : ""} lost`, points: b.banners * banner });
  const destroyed = points("dead");
  return { destroyed, fleeing: points("fleeing"), scenario: b.scenario, banners: b.banners, generalLost: b.generalLost, bsbLost: b.bsbLost, extra, total: destroyed + extra.reduce((n, e) => n + e.points, 0) }; // given up; scenario points are kept apart
}
