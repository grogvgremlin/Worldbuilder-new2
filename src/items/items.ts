// The stored items: every kind of thing the app keeps, as plain records.
// Data structure: WorldBuilder rebuild/data-structure.md §2–5. Design: design/races-and-units.md,
// design/options-items-and-rules.md, design/army-lists.md, design/items-packages-and-library.md.
//
// Rule for this file: a stored record must read on its own, without the app. So field names are
// full words and values are ordinary numbers and strings. The owner's compact cell notation
// ("Halberds(add;+1~pi)") never appears here: it is read once on upload (src/notation/) and written
// back on download.
//
// Absent fields mean "blank cell". Every schema is strict, so a misspelt field is an error.

import { z } from "zod";

// --- Small values shared by many kinds ----------------------------------------------------------

// Where an item is printed.
export const Reference = z.strictObject({
  source: z.string(),
  page: z.string().optional(), // "48", "48-73"
});
export type Reference = z.infer<typeof Reference>;

// A named reference to another thing, as written at the point of use.
// "Barded Warhorse(Ridden)~Mount"  -> { name: "Barded Warhorse", detail: "Ridden", as: "Mount" }
// "Magic Resistance(-1)"           -> { name: "Magic Resistance", detail: "-1" }
// "Two Handed[-Strike Last]"       -> { name: "Two Handed", linked: [{ name: "Strike Last", change: "remove" }] }
// `item` is the key of the item the name was matched to (null: matched nothing; absent: not looked up).
// The name is kept as written ("Halberds"), so it doubles as the alias at the point of use.
export type Term = {
  name: string;
  item?: string | null;
  detail?: string;
  as?: string;
  linked?: Term[];
  change?: "add" | "remove" | "replace"; // + / add: (added), - (removed), replace~ (replaced by what follows)
};
export const Term: z.ZodType<Term> = z.lazy(() =>
  z.strictObject({
    name: z.string(),
    item: z.string().nullable().optional(),
    detail: z.string().optional(),
    as: z.string().optional(),
    linked: z.array(Term).optional(),
    change: z.enum(["add", "remove", "replace"]).optional(),
  }),
);

// A cost. "5~pi" -> 5 points per model; "+16" -> adds 16; "90" -> 90 for the unit.
export const Cost = z.strictObject({
  points: z.number(),
  per: z.enum(["model", "unit"]),
  adds: z.boolean(), // written with a +: on top of what it's added to
});
export type Cost = z.infer<typeof Cost>;

// A size, count or amount. "10-" -> min 10, no max; "0-1"; "1"; "-50" -> max 50, no min written.
export const Range = z.strictObject({
  min: z.number().nullable(),
  max: z.number().nullable(),
  perModelOf: z.string().optional(), // "1 per (Empire Knights)"
});
export type Range = z.infer<typeof Range>;

// One stat cell. A plain number is the stat as printed ("4" -> 4). Otherwise one field is set:
// "+1" change · "-" none · "(+1)" riderChange (what a mount gives its rider) · "4+" target (a save)
// · anything else as text ("S": as the user's); `when` holds conditions written after it.
export const StatDetail = z.strictObject({
  value: z.number().optional(),
  change: z.number().optional(),
  none: z.literal(true).optional(),
  riderChange: z.number().optional(),
  target: z.number().optional(),
  text: z.string().optional(),
  when: z.array(Term).optional(),
});
export const Stat = z.union([z.number(), StatDetail]);
export type Stat = z.infer<typeof Stat>;
export type Stats = Record<string, Stat>;
const Stats = z.record(z.string(), Stat);

// --- Option groups, slots and limits ----------------------------------------------------------

// One choice in an option group.
export const Option = z.strictObject({
  name: z.string(),
  item: z.string().nullable().optional(),
  detail: z.string().optional(), // "Wizard(4)": the 4
  as: z.string().optional(), // "~Mount"
  addsToInherited: z.boolean().optional(), // written with a leading +
  action: z.enum(["add", "replace", "upgrade"]).optional(),
  replaces: z.array(Term).optional(), // replace~Shield; replace~Crossbow|Handgun
  cost: Cost.optional(),
  budget: Range.optional(), // "0-25 total": points that may be spent through it
  count: Range.optional(), // "0-1": how many may be taken
  conditions: z.array(Term).optional(), // Only(Mounted), MayBe(...)
  grants: z.array(Term).optional(), // [Troop Type(Heavy Cavalry);Counter Charge] while taken
});
export type Option = z.infer<typeof Option>;

// A set of choices. More than one option: choose one of them. One option: take it or not.
export const OptionGroup = z.strictObject({
  choose: z.literal("one"),
  required: z.boolean(),
  options: z.array(Option),
});
export type OptionGroup = z.infer<typeof OptionGroup>;

// A whole options cell: groups, plus what it removes from an inherited entry.
export const Options = z.strictObject({
  removeAllInherited: z.boolean().optional(), // "None"
  removeInherited: z.array(Term).optional(), // "-War Altar of Sigmar~Mount"
  groups: z.array(OptionGroup),
});
export type Options = z.infer<typeof Options>;

// A command slot on a unit. "C(slots)" -> the unit's own C row; "SB(0-1;upgrade;+5)".
export const Slot = z.strictObject({
  code: z.string(), // C, SB, M, BSB, Crew, Steed
  item: z.string().nullable().optional(), // the slot kind matched
  fromUnitRows: z.boolean().optional(),
  count: Range.optional(),
  type: z.string().optional(), // upgrade, crew, steed
  cost: Cost.optional(),
});
export type Slot = z.infer<typeof Slot>;

export const Slots = z.strictObject({
  none: z.boolean().optional(), // "None": no slots, overriding inherited ones
  slots: z.array(Slot),
});
export type Slots = z.infer<typeof Slots>;

// A limit. "unit(Great Cannon,Mortar)~0-3~1000 roster target" -> counts unit, of [Great Cannon,
// Mortar], amount 0-3, per 1000 points of the roster target.
export const Limit = z.strictObject({
  counts: z.string(), // unit, units, points, rules options, SB, General …
  of: z.array(z.string()).optional(), // names in the brackets: unit(A,B); SB(Magic Standard)
  where: z.string().optional(), // a filter in square brackets, as written (not read yet)
  amount: Range,
  percent: z.boolean(),
  perPoints: z.number().optional(), // 1000: "per 1,000 points"
  basis: z.string().optional(), // roster target, army
});
export type Limit = z.infer<typeof Limit>;

export const Limits = z.strictObject({
  none: z.boolean().optional(), // "None": no limit, overriding an inherited one
  limits: z.array(Limit),
});
export type Limits = z.infer<typeof Limits>;

// --- Item kinds ----------------------------------------------------------------------------------

const common = {
  key: z.string(), // readable: tow.unit.empire-knights
  name: z.string(),
  homePackage: z.string().optional(), // the package it was entered in (absent for a game)
  status: z.enum(["entered", "stub"]).optional(), // stub: named somewhere, not entered yet
  reference: Reference.optional(),
  notes: z.string().optional(),
};

// The game: what an edition counts. Its rules and content are in its packages.
export const Game = z.strictObject({
  ...common,
  kind: z.literal("game"),
  shortName: z.string(),
  statlines: z.strictObject({
    model: z.array(z.string()),
    extra: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
    weapon: z.array(z.string()).optional(),
  }),
  bounds: z.record(z.string(), z.unknown()).optional(),
  measures: z.array(z.record(z.string(), z.string())),
  categories: z.array(z.string()),
  sections: z.array(z.string()).optional(),
  troopTypes: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  bagOrder: z.array(z.string()),
  core: z.array(z.string()), // package keys always on
  defaultComposition: z.array(z.string()).optional(), // composition sets a new context starts with
});
export type Game = z.infer<typeof Game>;

// A package: an ordered list of members, switched on and off as one.
export const Package = z.strictObject({
  ...common,
  kind: z.literal("package"),
  game: z.string(),
  layer: z.enum(["core", "book", "faq", "house", "campaign"]),
  partOf: z.string().optional(), // a book's army inside the book: The Empire in Forces of Fantasy
  members: z.array(z.string()), // item keys, in order
  includes: z.array(z.string()), // other packages included whole
  needsStated: z.array(z.string()), // package keys it needs that references can't show
  corrects: z.string().optional(), // an FAQ: the package it corrects
  stubsFor: z.string().optional(), // made by the app: stubs for names in this package that match nothing
  section: z.string().optional(), // a heading it's shown under in the Library ("App specific")
});
export type Package = z.infer<typeof Package>;

// One cell of a race's grid: race · tree · rank.
export const RaceProfile = z.strictObject({
  ...common,
  kind: z.literal("race-profile"),
  race: z.string(),
  tree: z.string().optional(), // blank means Core
  rank: z.string().optional(), // blank means Base
  stats: Stats,
  rules: z.array(Term),
});
export type RaceProfile = z.infer<typeof RaceProfile>;

// One row of a unit: its own model line, a command slot, a mount, crew or steeds.
export const UnitRow = z.strictObject({
  type: z.string(), // as written: Unit, Slots-Upgrade, Crew, Steed
  slotCode: z.string().optional(), // C, SB … for a slot row
  name: z.string().optional(), // the printed line: State Missile Trooper, Sergeant
  stats: Stats,
  save: Stat.optional(),
  cost: Cost.optional(),
  equipment: z.array(Term),
  size: Range.optional(),
  troopType: z.strictObject({ type: z.string(), character: z.boolean() }).optional(),
  baseSize: z
    .strictObject({ width: z.number().optional(), depth: z.number().optional(), unit: z.string().optional(), text: z.string().optional() })
    .optional(),
  slots: Slots.optional(),
  equipmentOptions: Options.optional(),
  rulesOptions: Options.optional(),
  limits: Limits.optional(),
  rules: z.array(Term),
  statuses: z.array(Term),
  race: z.string().optional(),
  tree: z.string().optional(),
  rank: z.string().optional(),
  reference: Reference.optional(),
  notes: z.string().optional(),
});
export type UnitRow = z.infer<typeof UnitRow>;

// A unit: one book entry (the card). rows[0] is its own line.
// Its army category (Core, Special …) is on the army list's entry, not here.
export const Unit = z.strictObject({
  ...common,
  kind: z.literal("unit"),
  class: z.enum(["unit", "mount"]), // a mount is only taken through another unit's option
  inherits: Term.optional(), // "State Troops~Unit": store only what differs
  rows: z.array(UnitRow).min(1),
});
export type Unit = z.infer<typeof Unit>;

// A piece of equipment: mundane, magic, a weapon of a war machine.
export const Equipment = z.strictObject({
  ...common,
  kind: z.literal("equipment"),
  type: z.string().optional(), // weapon, armour, magic weapon, magic standard …
  countsAs: z.array(Term), // Match Key: Iron Shod Hooves counts as Hand Weapon
  aliases: z.array(z.string()), // Hand Weapon <- Sword, Axe
  stats: Stats, // on the bearer (barding M -1), or the weapon's S
  save: Stat.optional(),
  range: z.string().optional(), // as printed: Combat, 24"
  armourPiercing: z.string().optional(), // as printed: -1, -
  rules: z.array(Term),
  text: z.string().optional(),
  cost: Cost.optional(),
});
export type Equipment = z.infer<typeof Equipment>;

// A special rule printed in a book.
export const SpecialRule = z.strictObject({
  ...common,
  kind: z.literal("special-rule"),
  ruleType: z.string().optional(), // psychology, movement, magic … (for grouping and the quick reference)
  text: z.string().optional(),
  effectsAsWritten: z.string().optional(), // the sheet's programmatic Rules column; not read yet
});
export type SpecialRule = z.infer<typeof SpecialRule>;

// A kind of command slot: champion, standard bearer …
export const SlotKind = z.strictObject({
  ...common,
  kind: z.literal("slot-kind"),
  code: z.string(), // C, SB, M, BSB, Crew, Steed
  equipment: z.array(Term), // +Standard
  aliases: z.array(z.string()),
});
export type SlotKind = z.infer<typeof SlotKind>;

// An army list: its entries (unit + category) and its composition rules.
export const ArmyList = z.strictObject({
  ...common,
  kind: z.literal("army-list"),
  entries: z.array(z.strictObject({ unit: z.string(), category: z.string() })),
  composition: z.array(z.string()), // composition-rule keys
});
export type ArmyList = z.infer<typeof ArmyList>;

// An army-wide limit: Core at least 25%; 0–1 Helblaster per 1,000.
export const CompositionRule = z.strictObject({
  ...common,
  kind: z.literal("composition-rule"),
  category: z.string().optional(), // the Tier column: which category it limits
  limits: Limits,
});
export type CompositionRule = z.infer<typeof CompositionRule>;

// A source: a book, PDF or website the rules and lore cite (the bibliography).
// Items cite it by name in their reference ("Forces of Fantasy;64").
// Design: spec/pillars/background-and-narrative.md §3 (a source is the work; the reference sits on
// the citing item). Editions, ISBNs and what the owner owns are in the tail (foundations/tail.md).
export const Source = z.strictObject({
  ...common,
  kind: z.literal("source"),
  sourceKind: z.string().optional(), // book, PDF, website …
  by: z.string().optional(), // publisher or author
  published: z.string().optional(), // year, or date
  link: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

// A context: a game and the packages switched on for it, in groups — what a roster is built against.
// A pick-up game is a context with no world; a world holds one context per game played in it.
// Design: design/v2-reconciliation.md §1 (build rows: a manifest context names its game and lists its
// packages in four groups, each in order: books → FAQs → house rules → campaign; the game brings its
// core); design/army-lists.md §3 (composition packages attach at the roster or above); build-log
// Part B decisions 21, 26, 29; rebuild build log (composition sets chosen per context).
export const ContextPackage = z.strictObject({
  package: z.string(), // package key
  on: z.boolean(), // listed but switched off stays listed
});
export type ContextPackage = z.infer<typeof ContextPackage>;

export const Context = z.strictObject({
  ...common,
  kind: z.literal("context"),
  game: z.string(), // the game's short name: its core is always on
  world: z.string().optional(), // the world it belongs to; absent for a pick-up game (not shown when list building)
  books: z.array(ContextPackage),
  faqs: z.array(ContextPackage),
  house: z.array(ContextPackage),
  campaign: z.array(ContextPackage), // only in a world
  composition: z.array(ContextPackage), // composition sets: Standard, Grand Melee, a tournament pack …
});
export type Context = z.infer<typeof Context>;

export const Item = z.discriminatedUnion("kind", [Game, Package, RaceProfile, Unit, Equipment, SpecialRule, SlotKind, ArmyList, CompositionRule, Source, Context]);
export type Item = z.infer<typeof Item>;
export type ItemKind = Item["kind"];
