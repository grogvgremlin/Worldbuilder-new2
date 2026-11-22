// Each sheet tab, both ways: rows as typed -> stored items, and stored items -> rows.
// Tabs and columns are the owner's sheet format (format/schemae.csv in the data repo); one CSV per tab.
// Data structure: rebuild/data-structure.md §4.
//
// Reading only reads cells: names are matched to items afterwards (resolve.ts).

import type { ArmyList, CompositionRule, Equipment, RaceProfile, SlotKind, SpecialRule, Stats, Unit, UnitRow } from "../items/items";
import { itemKey } from "../items/keys";
import type { Row } from "../sheets/csv";
import { readOptions, writeOptions } from "../notation/options";
import { readLimits, readSlots, writeLimits, writeSlots } from "../notation/slots-and-limits";
import { readTerms, writeTerms } from "../notation/terms";
import * as v from "../notation/values";

// Where a problem was found, and what it was.
export type Problem = { where: string; message: string };

// What every reader needs to know.
export type TabContext = {
  game: string; // tow
  packageKey: string; // tow.the-empire
  packageName: string; // The Empire of Man
  file: string; // forces-of-fantasy/the-empire/units.csv (for problems)
  problems: Problem[];
};

export const STATS = ["M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];

export const COLUMNS = {
  races: ["Race", "Tree", "Rank", ...STATS, "Rules", "Reference", "Notes"],
  equipment: ["Equipment", "Match Key", ...STATS, "Save", "Rules", "Alias", "Rules 2", "Type", "R", "AP", "Cost", "Reference"],
  rules: ["Rule", "Rules", "Rules 2", "Reference"],
  commonLinks: ["Link Key", "Name", "Equipment", "Alias", "Reference"],
  armyEntry: [
    "Package", "SubPackage", "Rule Type", "Unit", "Key", "Type", "Link Key", "Name", "Tier", ...STATS,
    "Cost", "Equipment", "Min/Max", "Troop Type", "Base Size", "Slots", "Equipment Options", "Reference",
    "Unit Limit", "Rules", "Rules Options", "Status", "Race", "Rank", "Tree", "Save", "Notes",
  ],
};

// The text that marks a rulebook item not yet entered (the data repo's convention).
const NOT_ENTERED = "rulebook: not entered";

// Reads cells with a problem list that knows the row and column it's in.
function cellReader(ctx: TabContext, rowNumber: number) {
  return function at<T>(column: string, read: (problems: string[]) => T): T {
    const local: string[] = [];
    const value = read(local);
    for (const message of local) ctx.problems.push({ where: `${ctx.file} row ${rowNumber}, ${column}`, message });
    return value;
  };
}

function readStats(row: Row): Stats {
  const stats: Stats = {};
  for (const s of STATS) {
    const stat = v.readStat(row[s]);
    if (stat) stats[s] = stat;
  }
  return stats;
}

function writeStats(stats: Stats, row: Row): void {
  for (const s of STATS) row[s] = v.writeStat(stats[s]);
}

// Only fields that have a value: a blank cell is an absent field.
function compact<T extends object>(record: T): T {
  for (const k of Object.keys(record) as (keyof T)[]) if (record[k] === undefined) delete record[k];
  return record;
}

// --- Races ------------------------------------------------------------------------------------

export function readRaceRows(rows: Row[], ctx: TabContext): RaceProfile[] {
  return rows.map((row, i) => {
    const at = cellReader(ctx, i + 2);
    const race = row["Race"].trim();
    const tree = v.readText(row["Tree"]);
    const rank = v.readText(row["Rank"]);
    return compact<RaceProfile>({
      key: itemKey(ctx.game, "race-profile", race, tree ?? "Core", rank ?? "Base"),
      kind: "race-profile",
      name: [race, tree ?? "Core", rank ?? "Base"].join(" · "),
      homePackage: ctx.packageKey,
      race,
      tree,
      rank,
      stats: readStats(row),
      rules: at("Rules", (p) => readTerms(row["Rules"], p)),
      reference: v.readReference(row["Reference"]),
      notes: v.readText(row["Notes"]),
    });
  });
}

export function writeRaceRow(item: RaceProfile): Row {
  const row: Row = { Race: item.race, Tree: item.tree ?? "", Rank: item.rank ?? "" };
  writeStats(item.stats, row);
  row["Rules"] = writeTerms(item.rules);
  row["Reference"] = v.writeReference(item.reference);
  row["Notes"] = item.notes ?? "";
  return row;
}

// --- Equipment --------------------------------------------------------------------------------

export function readEquipmentRows(rows: Row[], ctx: TabContext): Equipment[] {
  return rows.map((row, i) => {
    const at = cellReader(ctx, i + 2);
    const name = row["Equipment"].trim();
    const text = v.readText(row["Rules 2"]);
    return compact<Equipment>({
      key: itemKey(ctx.game, "equipment", name),
      kind: "equipment",
      name,
      homePackage: ctx.packageKey,
      status: text === NOT_ENTERED ? "stub" : undefined,
      type: v.readText(row["Type"]),
      countsAs: at("Match Key", (p) => readTerms(row["Match Key"], p)),
      aliases: v.readNameList(row["Alias"]),
      stats: readStats(row),
      save: v.readStat(row["Save"]),
      range: v.readText(row["R"]),
      armourPiercing: v.readText(row["AP"]),
      rules: at("Rules", (p) => readTerms(row["Rules"], p)),
      text: text === NOT_ENTERED ? undefined : text,
      cost: at("Cost", (p) => v.readCost(row["Cost"], p)),
      reference: v.readReference(row["Reference"]),
    });
  });
}

export function writeEquipmentRow(item: Equipment): Row {
  const row: Row = { Equipment: item.name, "Match Key": writeTerms(item.countsAs) };
  writeStats(item.stats, row);
  row["Save"] = v.writeStat(item.save);
  row["Rules"] = writeTerms(item.rules);
  row["Alias"] = v.writeNameList(item.aliases);
  row["Rules 2"] = item.status === "stub" && item.text === undefined ? NOT_ENTERED : item.text ?? "";
  row["Type"] = item.type ?? "";
  row["R"] = item.range ?? "";
  row["AP"] = item.armourPiercing ?? "";
  row["Cost"] = v.writeCost(item.cost);
  row["Reference"] = v.writeReference(item.reference);
  return row;
}

// --- Special rules ----------------------------------------------------------------------------

export function readRuleRows(rows: Row[], ctx: TabContext): SpecialRule[] {
  return rows.map((row) => {
    const name = row["Rule"].trim();
    const text = v.readText(row["Rules 2"]);
    return compact<SpecialRule>({
      key: itemKey(ctx.game, "special-rule", name),
      kind: "special-rule",
      name,
      homePackage: ctx.packageKey,
      status: text === NOT_ENTERED ? "stub" : undefined,
      text: text === NOT_ENTERED ? undefined : text,
      effectsAsWritten: v.readText(row["Rules"]),
      reference: v.readReference(row["Reference"]),
    });
  });
}

export function writeRuleRow(item: SpecialRule): Row {
  return {
    Rule: item.name,
    Rules: item.effectsAsWritten ?? "",
    "Rules 2": item.status === "stub" && item.text === undefined ? NOT_ENTERED : item.text ?? "",
    Reference: v.writeReference(item.reference),
  };
}

// --- Common links (slot kinds) ----------------------------------------------------------------

export function readCommonLinkRows(rows: Row[], ctx: TabContext): SlotKind[] {
  return rows.map((row, i) => {
    const at = cellReader(ctx, i + 2);
    const code = row["Link Key"].trim();
    return compact<SlotKind>({
      key: itemKey(ctx.game, "slot-kind", code),
      kind: "slot-kind",
      name: row["Name"].trim(),
      homePackage: ctx.packageKey,
      code,
      equipment: at("Equipment", (p) => readTerms(row["Equipment"], p)),
      aliases: v.readNameList(row["Alias"]),
      reference: v.readReference(row["Reference"]),
    });
  });
}

export function writeCommonLinkRow(item: SlotKind): Row {
  return {
    "Link Key": item.code,
    Name: item.name,
    Equipment: writeTerms(item.equipment),
    Alias: v.writeNameList(item.aliases),
    Reference: v.writeReference(item.reference),
  };
}

// --- Army Entry: units, an army list, composition rules -----------------------------------------

export type ArmyEntryResult = { units: Unit[]; armyList: ArmyList | null; composition: CompositionRule[] };

// `categories` are the game's army categories; a Tier of "Mount" marks a mount (rebuild data-structure §4.2).
export function readArmyEntryRows(rows: Row[], ctx: TabContext, categories: string[]): ArmyEntryResult {
  const units: Unit[] = [];
  const composition: CompositionRule[] = [];
  const entries: ArmyList["entries"] = [];
  const byName = new Map<string, Unit>();

  rows.forEach((row, i) => {
    const at = cellReader(ctx, i + 2);
    const type = row["Type"].trim();
    if (type === "Composition" || row["Rule Type"].trim() === "Composition") {
      const name = row["Name"].trim();
      composition.push(
        compact<CompositionRule>({
          key: itemKey(ctx.game, "composition-rule", ctx.packageName, name),
          kind: "composition-rule",
          name,
          homePackage: ctx.packageKey,
          category: v.readText(row["Tier"]),
          limits: at("Unit Limit", (p) => readLimits(row["Unit Limit"], p)) ?? { limits: [] },
          reference: v.readReference(row["Reference"]),
          notes: v.readText(row["Notes"]),
        }),
      );
      return;
    }

    const unitName = row["Unit"].trim();
    const unitRow = readUnitRow(row, at);
    let unit = byName.get(unitName);
    if (!unit) {
      if (type !== "Unit") at("Type", (p) => p.push(`the first row of "${unitName}" is a ${type} row, not a Unit row`));
      const tier = v.readText(row["Tier"]);
      unit = compact<Unit>({
        key: itemKey(ctx.game, "unit", unitName),
        kind: "unit",
        name: unitName,
        homePackage: ctx.packageKey,
        class: tier === "Mount" ? "mount" : "unit",
        inherits: v.readText(row["Link Key"]) ? readTerms(row["Link Key"])[0] : undefined,
        rows: [unitRow],
      });
      byName.set(unitName, unit);
      units.push(unit);
      if (tier && tier !== "Mount") {
        if (!categories.includes(tier)) at("Tier", (p) => p.push(`"${tier}" isn't one of the game's categories (${categories.join(", ")})`));
        entries.push({ unit: unit.key, category: tier });
      }
    } else {
      unitRow.slotCode = v.readText(row["Link Key"]);
      unit.rows.push(compact(unitRow));
    }
  });

  const armyList: ArmyList | null =
    units.length === 0
      ? null
      : {
          key: itemKey(ctx.game, "army-list", ctx.packageName),
          kind: "army-list",
          name: ctx.packageName,
          homePackage: ctx.packageKey,
          entries,
          composition: [],
        };
  return { units, armyList, composition };
}

function readUnitRow(row: Row, at: ReturnType<typeof cellReader>): UnitRow {
  return compact<UnitRow>({
    type: row["Type"].trim(),
    name: v.readText(row["Name"]),
    stats: readStats(row),
    save: v.readStat(row["Save"]),
    cost: at("Cost", (p) => v.readCost(row["Cost"], p)),
    equipment: at("Equipment", (p) => readTerms(row["Equipment"], p)),
    size: at("Min/Max", (p) => v.readRange(row["Min/Max"], p)),
    troopType: v.readTroopType(row["Troop Type"]),
    baseSize: v.readBaseSize(row["Base Size"]),
    slots: at("Slots", (p) => readSlots(row["Slots"], p)),
    equipmentOptions: at("Equipment Options", (p) => readOptions(row["Equipment Options"], p)),
    rulesOptions: at("Rules Options", (p) => readOptions(row["Rules Options"], p)),
    limits: at("Unit Limit", (p) => readLimits(row["Unit Limit"], p)),
    rules: at("Rules", (p) => readTerms(row["Rules"], p)),
    statuses: at("Status", (p) => readTerms(row["Status"], p)),
    race: v.readText(row["Race"]),
    tree: v.readText(row["Tree"]),
    rank: v.readText(row["Rank"]),
    reference: v.readReference(row["Reference"]),
    notes: v.readText(row["Notes"]),
  });
}

// What the Package and SubPackage columns say for a package: a book's army sits under the book.
export type PackageColumns = { Package: string; SubPackage: string };

export function writeUnitRows(unit: Unit, category: string | undefined, columns: PackageColumns): Row[] {
  return unit.rows.map((r, i) => {
    const row: Row = { ...columns, "Rule Type": "Army List", Unit: unit.name, Key: "", Type: r.type };
    row["Link Key"] = i === 0 ? (unit.inherits ? writeTerms([unit.inherits]) : "") : r.slotCode ?? "";
    row["Name"] = r.name ?? "";
    row["Tier"] = i === 0 ? (unit.class === "mount" ? "Mount" : category ?? "") : "";
    writeStats(r.stats, row);
    row["Cost"] = v.writeCost(r.cost);
    row["Equipment"] = writeTerms(r.equipment);
    row["Min/Max"] = v.writeRange(r.size);
    row["Troop Type"] = v.writeTroopType(r.troopType);
    row["Base Size"] = v.writeBaseSize(r.baseSize);
    row["Slots"] = writeSlots(r.slots);
    row["Equipment Options"] = writeOptions(r.equipmentOptions);
    row["Reference"] = v.writeReference(r.reference);
    row["Unit Limit"] = writeLimits(r.limits);
    row["Rules"] = writeTerms(r.rules, "rules");
    row["Rules Options"] = writeOptions(r.rulesOptions);
    row["Status"] = writeTerms(r.statuses);
    row["Race"] = r.race ?? "";
    row["Rank"] = r.rank ?? "";
    row["Tree"] = r.tree ?? "";
    row["Save"] = v.writeStat(r.save);
    row["Notes"] = r.notes ?? "";
    return row;
  });
}

export function writeCompositionRow(rule: CompositionRule, columns: PackageColumns): Row {
  return {
    ...columns,
    "Rule Type": "Composition",
    Type: "Composition",
    Name: rule.name,
    Tier: rule.category ?? "",
    Reference: v.writeReference(rule.reference),
    "Unit Limit": writeLimits(rule.limits),
    Notes: rule.notes ?? "",
  };
}
