// A list as you'd want it at the table (owner, 24 Nov; after the Old World Builder's game view): for
// each unit, its stat lines (its own, the command models taken, its mount), its kit with the options
// taken, its special rules with those taken and given, its magic items, its page. Filters choose what
// shows. Battle tracking comes with the Battle tool (owner, 24 Nov). Pure: a roster view and the library in.
// Design: design/rosters.md §4 (views of a roster are derived, never stored).

import type { Equipment, Game, Item, MagicItem, Option, OptionGroup, RaceProfile, SlotKind, SpecialRule, Stats, Term, Unit } from "../items/items";
import { dimensionsOf, gameOf, headingFor, profileKey } from "../items/race-dimensions";
import { unitAsPrinted } from "../rules/race-deltas";
import { groupFor } from "./summary-groups";
import { readItemPick } from "./magic-items";
import { patchStats } from "../rules/patches";
import { optionKey, unitAsTaken } from "./unit-as-taken";
import type { RosterView, UnitView } from "./roster";
import { inReach } from "./roster";
import { matchName } from "../items/keys";

export type StatLine = { name: string; stats: Stats }; // name "" for the unit's own line
export type RuleRef = { name: string; key?: string; text?: string };
export type Ref = { name: string; key?: string }; // a name, and the card it opens
export type CommandModel = { name: string; key?: string; kit: Ref[] }; // key: the slot kind it inherits from (Champion)
export type GameUnit = {
  id: string;
  name: string;
  size: number;
  points: number;
  category: string;
  general: boolean;
  lines: StatLine[];
  equipment: Ref[];
  command: { section: string; models: CommandModel[] }[]; // by the slots' sections (Command, …)
  rules: RuleRef[];
  items: { name: string; type: string; key: string }[]; // the unit's own (a character's); a command model's are in its kit
  ref?: { source: Ref; page?: string }; // "Ref: Forces of Fantasy [p. 64]": the source and the page, each a link
  note?: string;
  battleNote?: string;
  title?: string; // the owner's name for it: "Marcus Aurelius"
  icon?: string;
  description?: string;
  words: string[]; // everything it can be found by: names, kit, mounts and their kit, races, rules, items
};

export function gameUnits(view: RosterView, items: Item[]): GameUnit[] {
  const context = items.find((i) => i.kind === "context" && i.key === view.roster.context);
  const reach = context?.kind === "context" ? inReach(context, items) : items;
  const game = items.find((i): i is Game => i.kind === "game" && context?.kind === "context" && i.shortName === context.game);
  return view.units.filter((u) => u.taken).map((u) => gameUnit(u, reach, game, items));
}

function gameUnit(u: UnitView, reach: Item[], game: Game | undefined, all: Item[]): GameUnit {
  const t = u.taken!;
  const ru = u.rosterUnit;
  const ruleText = (term: Term): RuleRef => {
    const rule = reach.find((i): i is SpecialRule => i.kind === "special-rule" && (i.key === term.item || matchName(i.name) === matchName(term.name)));
    return { name: term.name + (term.detail ? ` (${term.detail})` : ""), key: rule?.key, text: rule?.text };
  };
  const termName = (e: Term) => e.name + (e.detail ? ` (${e.detail})` : "");
  // A thing's card: what the name was matched to, or an item of that name in reach.
  const keyOf = (t: { name: string; item?: string | null }) =>
    t.item ?? reach.find((i) => (i.kind === "equipment" || i.kind === "magic-item" || i.kind === "unit") && matchName(i.name) === matchName(t.name))?.key;

  // The options picked, each matched to its option by the same key the pick was made with.
  const picked = ru.picks.filter((p) => !readItemPick(p));
  const allOptions = (groups: OptionGroup[]) => groups.flatMap((g) => g.options);
  const pickedIn = (where: string, options: Option[]) =>
    u.choices
      .filter((g) => g.where === where)
      .flatMap((g) => g.choices.filter((c) => picked.includes(c.pick)))
      .map((c) => options.find((o) => optionKey(o) === c.label) ?? ({ name: c.label } as Option));
  const unitOptions = pickedIn("options", allOptions(t.options));
  const rulesTaken = pickedIn("rules options", allOptions(t.rulesOptions));
  const itemsFor = (where: string) =>
    ru.picks
      .map(readItemPick)
      .filter((p) => p && p.where === where)
      .map((p) => reach.find((i): i is MagicItem => i.kind === "magic-item" && i.key === p!.itemKey))
      .filter((i): i is MagicItem => !!i);

  // Kit: what it comes with, less mounts and whatever an option or item replaces, then what was taken.
  const kitOf = (base: Term[], options: Option[], magic: MagicItem[]) => {
    const replaced = new Set([...options, ...magic.map((m) => ({ replaces: m.countsAs }) as Option)].flatMap((o) => o.replaces ?? []).map((r) => matchName(r.name)));
    const kept = base.filter((e) => e.as !== "Mount" && !replaced.has(matchName(e.name)));
    const refs: Ref[] = [
      ...kept.map((e) => ({ name: termName(e), key: keyOf(e) })),
      ...options.filter((o) => o.as !== "Mount" && o.name).map((o) => ({ name: o.name, key: keyOf(o) })),
      ...magic.map((m) => ({ name: m.name, key: m.key })),
    ];
    return { terms: kept, names: refs };
  };
  const ownKit = kitOf(t.equipment, unitOptions, []);

  const mountWords: string[] = [];
  // Stat lines: the unit's own (its race under it, its kit's effects on it), each command model taken
  // with its changes, each mount. One line: no name; several: only the others are named.
  const base = withKit(withRace(t.unit, t.stats, reach, game), ownKit.terms, unitOptions, reach, game?.bearerTypes ?? ["armour"]);
  const lines: StatLine[] = [{ name: "", stats: base }];
  for (const row of t.slotRows) {
    if (!row.name || !ru.slots.includes(row.name) || Object.keys(row.stats).length === 0) continue;
    // Printed numbers on the row are its own (its race + difference); "+1" changes are to the unit's line.
    const owner = t.chain.find((c) => c.rows.includes(row));
    const printed = owner ? unitAsPrinted(owner, all).rows[owner.rows.indexOf(row)].stats : row.stats;
    lines.push({ name: row.name, stats: patchStats(base, printed) });
  }
  for (const m of [...t.equipment.filter((e) => e.as === "Mount"), ...unitOptions.filter((o) => o.as === "Mount")]) {
    const mount = reach.find((i): i is Unit => i.kind === "unit" && (i.key === m.item || matchName(i.name) === matchName(m.name)));
    if (!mount) continue;
    const mt = unitAsTaken(mount, reach);
    mountWords.push(mount.name, mount.rows[0].name ?? "", ...mt.equipment.map((e) => e.name), ...Object.values(mount.rows[0].profile ?? {}));
    lines.push({ name: mount.rows[0].name ?? mount.name, stats: withKit(withRace(mount, mt.stats, reach, game), mt.equipment, [], reach, game?.bearerTypes ?? ["armour"]) });
  }

  // Command models taken, by section, each with its own kit.
  const slotKinds = reach.filter((i): i is SlotKind => i.kind === "slot-kind");
  const command: GameUnit["command"] = [];
  for (const slot of t.slots) {
    const row = slot.fromUnitRows ? t.slotRows.find((r) => r.slotCode === slot.code) : undefined;
    const kind = slotKinds.find((k) => k.code === slot.code);
    const name = row?.name ?? kind?.name ?? slot.code;
    if (!ru.slots.includes(name)) continue;
    const where = `slot:${name}`;
    const rowOptions = allOptions(row?.equipmentOptions?.groups ?? []);
    const options = row ? pickedIn(where, rowOptions) : [];
    // An item taken through an allowance takes the place of what the allowance replaces: a magic
    // standard taken through "Magic Standard (replace~Standard)" is carried instead of the Standard.
    const allowances = ru.picks.map(readItemPick).filter((p) => p && p.where === where).map((p) => rowOptions.find((o) => o.name === p!.allowance)).filter((o): o is Option => !!o);
    const kit = kitOf([...(row?.equipment ?? []), ...(kind?.equipment ?? [])], [...options, ...allowances.map((a) => ({ name: "", replaces: a.replaces }) as Option)], itemsFor(where));
    kit.names = kit.names.filter((r) => r.name);
    const section = slot.section ?? headingFor(game, "Slots");
    const at = command.find((c) => c.section === section) ?? (command.push({ section, models: [] }), command[command.length - 1]);
    at.models.push({ name, key: kind?.key, kit: kit.names });
  }

  // Rules: its own, the special-rule options taken, and what options give.
  const grants = unitOptions.flatMap((o) => (o.grants ?? []).filter((g) => g.name !== "Troop Type"));
  const rules = [...t.rules, ...rulesTaken.map((o) => ({ name: o.name, item: o.item, detail: o.detail }) as Term), ...grants].map(ruleText);

  const ref = t.unit.rows[0].reference ?? t.unit.reference;
  return {
    id: ru.id,
    name: t.name,
    size: ru.size,
    points: u.points,
    category: u.category,
    general: ru.general,
    lines,
    equipment: ownKit.names,
    command,
    rules,
    items: itemsFor("options").map((m) => ({ name: m.name, type: m.type, key: m.key })),
    ref: ref ? { source: { name: ref.source, key: reach.find((i) => i.kind === "source" && matchName(i.name) === matchName(ref.source))?.key }, page: ref.page } : undefined,
    note: ru.note,
    battleNote: ru.battleNote,
    title: ru.title,
    icon: ru.icon,
    description: ru.description,
    words: [
      t.name,
      t.unit.rows[0].name ?? "",
      ...Object.values(t.unit.rows[0].profile ?? {}),
      ...ownKit.names.map((r) => r.name),
      ...command.flatMap((c) => [c.section, ...c.models.flatMap((m) => [m.name, ...m.kit.map((k) => k.name)])]),
      ...rules.map((r) => r.name),
      ...itemsFor("options").map((m) => m.name),
      ...mountWords,
    ].filter(Boolean),
  };
}

// What a model's own kit does to its line: kit of the game's bearer types (Configuration; armour by
// default) changes the bearer (Barding: M -1); other kit doesn't (a weapon's S is the weapon's).
function withKit(stats: Stats, kit: (Term | Option)[], options: Option[], reach: Item[], bearerTypes: string[]): Stats {
  let out = stats;
  for (const t of [...kit, ...options]) {
    const eq = reach.find((i): i is Equipment => i.kind === "equipment" && (i.key === t.item || matchName(i.name) === matchName(t.name)));
    if (!eq || !bearerTypes.some((t) => (eq.type ?? "").toLowerCase() === t.toLowerCase())) continue;
    out = patchStats(out, eq.stats);
  }
  return out;
}

// A unit's stats on top of its race profile's: a horse entered with no stats of its own takes the
// Horse profile's; a unit's own values replace the profile's ("+1" changes it).
function withRace(unit: Unit, stats: Stats, reach: Item[], game: Game | undefined): Stats {
  const chain: Unit[] = [unit];
  for (let k = unit.inherits?.item; k; ) {
    const next = reach.find((i): i is Unit => i.kind === "unit" && i.key === k);
    if (!next || chain.includes(next)) break;
    chain.push(next);
    k = next.inherits?.item;
  }
  const profile: Record<string, string> = Object.assign({}, ...[...chain].reverse().map((u) => u.rows[0].profile ?? {}));
  const dims = dimensionsOf(game); // the game's own race dimensions (the game isn't among the packages in reach)
  if (!profile[dims[0].name]) return stats;
  const race = reach.find((i): i is RaceProfile => i.kind === "race-profile" && i.key === profileKey(unit.key.split(".")[0], profile, dims));
  return race ? patchStats(race.stats, stats) : stats;
}

// --- Army summary cards (owner, 24 Nov) ------------------------------------------------------------
// Everything in the list collated, one card per kind (equipment, special rules, magic items), grouped
// by each item's own label (its Type, unless the game says otherwise); a blank label falls under what
// the game's Configuration says. Each entry says which units have it.

export type SummaryEntry = { name: string; key?: string; text?: string; units: string[] };
export type SummaryGroup = { type: string; entries: SummaryEntry[] };
export type SummaryCard = { title: string; groups: SummaryGroup[] };

export function armySummary(units: GameUnit[], items: Item[], game?: Game): SummaryCard[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const label = (u: GameUnit) => u.title ?? u.name;
  const collect = (pick: (u: GameUnit) => (Ref & { text?: string })[], typeOf: (r: Ref) => string, order: string[]): SummaryGroup[] => {
    const groups = new Map<string, Map<string, SummaryEntry>>();
    for (const u of units)
      for (const r of pick(u)) {
        const type = typeOf(r);
        const id = r.key ?? matchName(r.name);
        const group = groups.get(type) ?? new Map<string, SummaryEntry>();
        const entry = group.get(id) ?? { name: r.name, key: r.key, text: r.text, units: [] };
        if (!entry.units.includes(label(u))) entry.units.push(label(u));
        group.set(id, entry);
        groups.set(type, group);
      }
    const rank = (t: string) => (t === "Other" ? order.length + 1 : order.includes(t) ? order.indexOf(t) : order.length); // "Other" last
    return [...groups]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([type, entries]) => ({ type, entries: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)) }));
  };
  const isMagic = (r: Ref) => !!r.key && byKey.get(r.key)?.kind === "magic-item";
  const kitOf = (u: GameUnit) => [...u.equipment, ...u.command.flatMap((c) => c.models.flatMap((m) => m.kit))];

  // Each card's groups come from the items' own labels (src/lists/summary-groups.ts).
  const typeOf = (card: string) => (r: Ref) => {
    const item = r.key ? byKey.get(r.key) : undefined;
    return item ? groupFor(item, card, game) : (game?.summaries?.[card]?.otherwise ?? "Other");
  };

  const cards: SummaryCard[] = [
    { title: "Equipment", groups: collect((u) => kitOf(u).filter((r) => !isMagic(r)), typeOf("Equipment"), []) },
    { title: "Special rules", groups: collect((u) => u.rules, typeOf("Special rules"), []) },
    { title: "Magic items", groups: collect((u) => [...u.items, ...kitOf(u).filter(isMagic)], typeOf("Magic items"), []) },
  ];
  return cards.filter((c) => c.groups.length > 0);
}

// --- The rules reference (owner, 24 Nov) --------------------------------------------------------------
// The army summary read as the cards themselves, to read the rules off quickly: every special rule,
// piece of kit and magic item in the list, grouped as the summary groups them, each with its details
// (a rule's text; a weapon's range, S, AP and rules; an item's text), and no list of units.

export type ReferenceEntry = { name: string; key?: string; facts: string[]; text?: string };
export type ReferenceSection = { title: string; groups: { type: string; entries: ReferenceEntry[] }[] };

export function armyReference(units: GameUnit[], items: Item[], game?: Game): ReferenceSection[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const order = ["Special rules", "Equipment", "Magic items"];
  return armySummary(units, items, game)
    .sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title))
    .map((card) => ({
      title: card.title,
      groups: card.groups.map((g) => ({ type: g.type, entries: g.entries.map((e) => details(e.name, e.key ? byKey.get(e.key) : undefined)) })),
    }));
}

function details(name: string, item: Item | undefined): ReferenceEntry {
  if (!item) return { name, facts: [], text: undefined };
  const stats = (s: Stats) => Object.entries(s).map(([k, v]) => `${k} ${typeof v === "number" ? v : v.change !== undefined ? (v.change > 0 ? `+${v.change}` : v.change) : v.text ?? (v.none ? "-" : "")}`);
  const ruleNames = (t: Term[]) => (t.length ? [t.map((r) => r.name + (r.detail ? `(${r.detail})` : "")).join(", ")] : []);
  if (item.kind === "special-rule") return { name, key: item.key, facts: [], text: item.text ?? "Not entered yet." };
  if (item.kind === "equipment" || item.kind === "magic-item") {
    const facts = [...(item.range ? [`R ${item.range}`] : []), ...stats(item.stats), ...(item.armourPiercing ? [`AP ${item.armourPiercing}`] : []), ...ruleNames(item.rules)];
    return { name, key: item.key, facts, text: item.text };
  }
  return { name, key: item.key, facts: [] };
}
