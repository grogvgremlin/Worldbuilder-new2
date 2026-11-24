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

// A setting the game offers: changed for a game or a list without code (owner, 22 Nov).
// Its value is text in the setting's own shorthand ("full(target / 1000)"); `choices` fill a dropdown.
export const GameSetting = z.strictObject({
  name: z.string(), // "Per 1,000 points"
  about: z.string().optional(),
  default: z.string(),
  choices: z.record(z.string(), z.string()), // label -> value
});
export type GameSetting = z.infer<typeof GameSetting>;

// A dimension of the race grid: Race, Tree, Rank … (owner, 23 Nov: configurable, "if I wanted to add a
// 4th"). `blank`: what an empty cell means (Tree: Core). Its name is also its sheet column.
export const RaceDimension = z.strictObject({ name: z.string(), blank: z.string().optional() });
export type RaceDimension = z.infer<typeof RaceDimension>;

// A ready-made start for a new context, by package names (resolved when used: a package not loaded
// yet is reported missing). "armies: all" also switches on every army in the books listed.
export const GamePreset = z.strictObject({
  name: z.string(),
  about: z.string().optional(),
  books: z.array(z.string()).optional(),
  armies: z.literal("all").optional(),
  faqs: z.array(z.string()).optional(),
  house: z.array(z.string()).optional(),
  composition: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.string()).optional(),
});
export type GamePreset = z.infer<typeof GamePreset>;

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
  settings: z.array(GameSetting).optional(),
  presets: z.array(GamePreset).optional(),
  raceDimensions: z.array(RaceDimension).optional(), // absent: Race, Tree (blank Core), Rank (blank Base)
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
  version: z.string().optional(), // an FAQ's version ("1.2"): the latest is switched on with its book
});
export type Package = z.infer<typeof Package>;

// One cell of a race's grid, placed by the game's race dimensions (Race, Tree, Rank by default;
// configurable: Settings → Configuration). `profile` holds the values as written, by
// dimension name: { Race: Human, Tree: Professional, Rank: Veteran }; a dimension left blank takes its
// "blank means" value (Tree: Core, Rank: Base).
export const RaceProfile = z.strictObject({
  ...common,
  kind: z.literal("race-profile"),
  profile: z.record(z.string(), z.string()),
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
  profile: z.record(z.string(), z.string()).optional(), // the race profile it draws on, by dimension: { Race: Human, Rank: Veteran }
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

// A magic item: kept apart from ordinary equipment (owner, 23 Nov), always with a type, because the
// rules about them go by type ("one of each type per bearer"). Its type is one the game's rules name
// (magic weapon, magic armour, talisman, arcane item, enchanted item, magic standard …).
// `extremelyCommon`: may be taken more than once in an army (written with a trailing * on its name).
export const MagicItem = z.strictObject({
  ...common,
  kind: z.literal("magic-item"),
  type: z.string(),
  extremelyCommon: z.boolean(),
  countsAs: z.array(Term), // Armour of Fortune counts as Heavy Armour
  stats: Stats,
  save: Stat.optional(),
  range: z.string().optional(),
  armourPiercing: z.string().optional(),
  rules: z.array(Term), // incl. Only(...) / MayBe(...): who may take it
  text: z.string().optional(),
  cost: Cost.optional(),
});
export type MagicItem = z.infer<typeof MagicItem>;

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

// A patch: a named change to things already entered, like a rule card (owner, 23 Nov). An FAQ's
// erratum, a house rule making Lances free, a unit given a new slot. Written in the same columns and
// notation as the entry tabs, on per-kind patch tabs; a cell left blank changes nothing.
//   Cost and stats: a plain value sets it ("22~pi"); "+1~pi" / "-1" changes it by that much.
//   Options, rules, equipment: the inheritance words ("+X" adds, "-X" removes, "None" clears, the same
//   name replaces in place; a plain list replaces the whole list).
// Patches apply in sequence: packages in their applied order, then the patch's place in its package.
// "Switches off" names earlier patches this one replaces while it's on (the design's supersedes).
// Design: design/rules-overlay.md (rules as scope + change, applied in order); spec/foundations
// (an FAQ is one patch per erratum, each takeable or skippable).
export const PatchChange = z.strictObject({
  target: Term, // the thing changed, by name; `item` is filled in when names are matched
  targetKind: z.enum(["unit", "equipment", "special-rule", "composition-rule"]),
  row: z.string().optional(), // a unit's command row by its code (C, SB); absent = the unit's own line
  unit: UnitRow.partial().optional(), // the cells written, for a unit
  equipment: z
    .strictObject({
      stats: Stats.optional(),
      save: Stat.optional(),
      cost: Cost.optional(),
      rules: z.array(Term).optional(),
      text: z.string().optional(),
      type: z.string().optional(),
      range: z.string().optional(),
      armourPiercing: z.string().optional(),
    })
    .optional(),
  rule: z.strictObject({ text: z.string().optional(), ruleType: z.string().optional() }).optional(),
  composition: z.strictObject({ category: z.string().optional(), limits: Limits.optional() }).optional(),
});
export type PatchChange = z.infer<typeof PatchChange>;

export const Patch = z.strictObject({
  ...common,
  kind: z.literal("patch"),
  switchesOff: z.array(z.string()), // names of patches this one replaces while it's on
  changes: z.array(PatchChange), // in order
});
export type Patch = z.infer<typeof Patch>;

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

// A package's value for one of the game's settings (a row of its Settings tab): a house rule saying
// "per 1,000 points counts started thousands", say.
export const SettingValue = z.strictObject({
  ...common,
  kind: z.literal("setting"),
  setting: z.string(), // the setting's name
  value: z.string(),
});
export type SettingValue = z.infer<typeof SettingValue>;

// A sandbox: the space contexts live in. "Pick-up" is permanent and has no world features (no
// places, log or dates); a world will be a sandbox with them (owner, 22 Nov).
export const Sandbox = z.strictObject({
  ...common,
  kind: z.literal("sandbox"),
  world: z.boolean(), // has world features (things, links, events, a log)
  permanent: z.boolean().optional(),
});
export type Sandbox = z.infer<typeof Sandbox>;
export const PICKUP = "pickup";

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
  sandbox: z.string().optional(), // the sandbox it's in; absent = Pick-up (never shown when list building)
  books: z.array(ContextPackage),
  faqs: z.array(ContextPackage),
  house: z.array(ContextPackage),
  campaign: z.array(ContextPackage), // only in a world
  composition: z.array(ContextPackage), // composition sets: Standard, Grand Melee, a tournament pack …
  settings: z.record(z.string(), z.string()).optional(), // this game's own values: setting name -> value
  off: z.array(z.string()).optional(), // single cards switched off here though their package is on (a patch, a rule …)
});
export type Context = z.infer<typeof Context>;

// A roster: what the user chose, never worked-out values (design/rosters.md §1–3). Built against a
// context (a pick-up game, or later a world's context) from one army list, to a points target.
export const RosterUnit = z.strictObject({
  id: z.string(), // unique within the roster
  unit: z.string(), // the unit's key
  size: z.number().int().min(1),
  picks: z.array(z.string()), // options taken, by where and name: "options|Handguns instead of Crossbow", "slot:Sergeant|…"
  slots: z.array(z.string()), // command taken, by name: "Sergeant", "Musician"
  general: z.boolean(), // holds the General role
  note: z.string().optional(), // the owner's own note, shown in the game view
});
export type RosterUnit = z.infer<typeof RosterUnit>;

export const Roster = z.strictObject({
  ...common,
  kind: z.literal("roster"),
  context: z.string(), // the context's key
  armyList: z.string(), // the army list's key
  target: z.number(), // points
  units: z.array(RosterUnit),
  settings: z.record(z.string(), z.string()).optional(), // this list's own values: setting name -> value
});
export type Roster = z.infer<typeof Roster>;

export const Item = z.discriminatedUnion("kind", [Game, Package, RaceProfile, Unit, Equipment, MagicItem, SpecialRule, SlotKind, ArmyList, CompositionRule, Patch, Source, SettingValue, Sandbox, Context, Roster]);
export type Item = z.infer<typeof Item>;
export type ItemKind = Item["kind"];
