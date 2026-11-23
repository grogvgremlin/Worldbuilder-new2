// The patch tabs, both ways: Unit Patches, Equipment Patches, Rule Patches, Composition Patches.
// A patch is a named change to things already entered (owner, 23 Nov): the same columns and notation
// as the entry tabs, with a Patch column naming it and a Switches off column. Rows that share a Patch
// name are one patch, even across tabs. A blank cell changes nothing.
//   "22~pi" sets a cost; "+1~pi" or "-1~pi" changes it by that much. Stats the same ("4", "+1").
//   Equipment, rules, options: "+X" adds, "-X" removes, the same name replaces it, "None" clears.
// Data structure: rebuild/data-structure.md (patches); the stored form is Patch in src/items/items.ts.

import type { Patch, PatchChange, UnitRow } from "../items/items";
import { itemKey } from "../items/keys";
import type { Row } from "../sheets/csv";
import { readOptions, writeOptions } from "../notation/options";
import { readLimits, readSlots, writeLimits, writeSlots } from "../notation/slots-and-limits";
import { readTerms, writeTerms } from "../notation/terms";
import * as v from "../notation/values";
import { cellReader, readStats, STATS, writeStats, type TabContext } from "./sheet-tabs";

const LEAD = ["Patch", "Switches off"];

export const PATCH_COLUMNS = {
  unit: [...LEAD, "Unit", "Link Key", "Name", ...STATS, "Save", "Cost", "Equipment", "Min/Max", "Troop Type", "Slots", "Equipment Options", "Unit Limit", "Rules", "Rules Options", "Reference", "Notes"],
  equipment: [...LEAD, "Equipment", ...STATS, "Save", "Rules", "Rules 2", "Type", "R", "AP", "Cost", "Reference", "Notes"],
  "special-rule": [...LEAD, "Rule", "Type", "Rules 2", "Reference", "Notes"],
  "composition-rule": [...LEAD, "Composition", "Tier", "Unit Limit", "Reference", "Notes"],
};

export type PatchKind = PatchChange["targetKind"];

// The column that names what a row changes.
const TARGET_COLUMN: Record<PatchKind, string> = { unit: "Unit", equipment: "Equipment", "special-rule": "Rule", "composition-rule": "Composition" };

// --- Reading ------------------------------------------------------------------------------------

// Reads one patch tab into the patches found so far (by name), adding to them in row order.
export function readPatchRows(kind: PatchKind, rows: Row[], ctx: TabContext, patches: Map<string, Patch>): void {
  rows.forEach((row, i) => {
    const at = cellReader(ctx, i + 2);
    const name = row["Patch"].trim();
    if (name === "") return at("Patch", (p) => p.push("every row needs the name of the patch it belongs to"));
    const target = row[TARGET_COLUMN[kind]].trim();
    if (target === "") return at(TARGET_COLUMN[kind], (p) => p.push(`the patch "${name}" doesn't say what it changes`));
    const patch = patchNamed(name, ctx, patches);
    for (const off of v.readNameList(row["Switches off"])) if (!patch.switchesOff.includes(off)) patch.switchesOff.push(off);
    patch.reference ??= v.readReference(row["Reference"]);
    patch.notes ??= v.readText(row["Notes"]);
    const change: PatchChange = { target: readTerms(target)[0], targetKind: kind };
    if (kind === "unit") {
      const code = v.readText(row["Link Key"]);
      if (code) change.row = code;
      change.unit = readUnitCells(row, at);
    }
    if (kind === "equipment") change.equipment = dropEmpty({ stats: nonEmpty(readStats(row)), save: v.readStat(row["Save"]), cost: at("Cost", (p) => readChangeCost(row["Cost"], p)), rules: readList(row["Rules"]), text: v.readText(row["Rules 2"]), type: v.readText(row["Type"]), range: v.readText(row["R"]), armourPiercing: v.readText(row["AP"]) });
    if (kind === "special-rule") change.rule = dropEmpty({ text: v.readText(row["Rules 2"]), ruleType: v.readText(row["Type"]) });
    if (kind === "composition-rule") change.composition = dropEmpty({ category: v.readText(row["Tier"]), limits: at("Unit Limit", (p) => readLimits(row["Unit Limit"], p)) });
    patch.changes.push(change);
  });
}

function patchNamed(name: string, ctx: TabContext, patches: Map<string, Patch>): Patch {
  const found = patches.get(name);
  if (found) return found;
  const patch: Patch = { key: itemKey(ctx.game, "patch", name), kind: "patch", name, homePackage: ctx.packageKey, switchesOff: [], changes: [] };
  patches.set(name, patch);
  return patch;
}

function readUnitCells(row: Row, at: ReturnType<typeof cellReader>): Partial<UnitRow> {
  return dropEmpty<Partial<UnitRow>>({
    name: v.readText(row["Name"]),
    stats: nonEmpty(readStats(row)),
    save: v.readStat(row["Save"]),
    cost: at("Cost", (p) => readChangeCost(row["Cost"], p)),
    equipment: at("Equipment", (p) => readList(row["Equipment"], p)),
    size: at("Min/Max", (p) => v.readRange(row["Min/Max"], p)),
    troopType: v.readTroopType(row["Troop Type"]),
    slots: at("Slots", (p) => readSlots(row["Slots"], p)),
    equipmentOptions: at("Equipment Options", (p) => readOptions(row["Equipment Options"], p)),
    limits: at("Unit Limit", (p) => readLimits(row["Unit Limit"], p)),
    rules: at("Rules", (p) => readList(row["Rules"], p)),
    rulesOptions: at("Rules Options", (p) => readOptions(row["Rules Options"], p)),
  });
}

// A cost in a patch: "-1~pi" is a change, like "+1~pi".
function readChangeCost(text: string | undefined, problems: string[]) {
  const cost = v.readCost(text, problems);
  if (cost && (text ?? "").trim().startsWith("-")) cost.adds = true;
  return cost;
}

// A list cell: blank is no change; "None" clears the list.
function readList(text: string | undefined, problems: string[] = []) {
  const t = (text ?? "").trim();
  if (t === "") return undefined;
  if (/^none$/i.test(t)) return [];
  return readTerms(t, problems);
}

function nonEmpty<T extends object>(record: T): T | undefined {
  return Object.keys(record).length ? record : undefined;
}

function dropEmpty<T extends object>(record: T): T {
  for (const k of Object.keys(record) as (keyof T)[]) if (record[k] === undefined) delete record[k];
  return record;
}

// --- Writing ------------------------------------------------------------------------------------

// The rows of one tab for a patch: one per change of that kind. The first carries the patch's
// Switches off, Reference and Notes.
export function writePatchRows(patch: Patch, kind: PatchKind): Row[] {
  return patch.changes
    .filter((c) => c.targetKind === kind)
    .map((change, i) => {
      const row: Row = Object.fromEntries(PATCH_COLUMNS[kind].map((c) => [c, ""]));
      row["Patch"] = patch.name;
      if (i === 0) {
        row["Switches off"] = v.writeNameList(patch.switchesOff);
        row["Reference"] = v.writeReference(patch.reference);
        row["Notes"] = patch.notes ?? "";
      }
      row[TARGET_COLUMN[kind]] = writeTerms([change.target]);
      if (change.unit) writeUnitCells(change, row);
      if (change.equipment) {
        const e = change.equipment;
        if (e.stats) writeStats(e.stats, row);
        Object.assign(row, { Save: v.writeStat(e.save), Rules: writeList(e.rules), "Rules 2": e.text ?? "", Type: e.type ?? "", R: e.range ?? "", AP: e.armourPiercing ?? "", Cost: v.writeCost(e.cost) });
      }
      if (change.rule) Object.assign(row, { Type: change.rule.ruleType ?? "", "Rules 2": change.rule.text ?? "" });
      if (change.composition) Object.assign(row, { Tier: change.composition.category ?? "", "Unit Limit": writeLimits(change.composition.limits) });
      return row;
    });
}

function writeUnitCells(change: PatchChange, row: Row): void {
  const u = change.unit!;
  row["Link Key"] = change.row ?? "";
  row["Name"] = u.name ?? "";
  if (u.stats) writeStats(u.stats, row);
  row["Save"] = v.writeStat(u.save);
  row["Cost"] = v.writeCost(u.cost);
  row["Equipment"] = writeList(u.equipment);
  row["Min/Max"] = v.writeRange(u.size);
  row["Troop Type"] = v.writeTroopType(u.troopType);
  row["Slots"] = writeSlots(u.slots);
  row["Equipment Options"] = writeOptions(u.equipmentOptions);
  row["Unit Limit"] = writeLimits(u.limits);
  row["Rules"] = writeList(u.rules, "rules");
  row["Rules Options"] = writeOptions(u.rulesOptions);
}

function writeList(terms: UnitRow["rules"] | undefined, style: "plus" | "rules" = "plus"): string {
  if (terms === undefined) return "";
  return terms.length === 0 ? "None" : writeTerms(terms, style);
}

// What one change says, in the sheet's words: "Empire Knights: Cost +1~pi; Rules add:Fear".
export function changeText(change: PatchChange): string {
  const row = writePatchRows({ key: "", kind: "patch", name: "", switchesOff: [], changes: [change] }, change.targetKind)[0];
  const skip = new Set([...LEAD, TARGET_COLUMN[change.targetKind], "Reference", "Notes"]);
  const cells = Object.entries(row).filter(([c, value]) => !skip.has(c) && value !== "" && !(c === "Link Key"));
  const what = writeTerms([change.target]) + (change.row ? ` (${change.row})` : "");
  return `${what}: ${cells.map(([c, value]) => `${c} ${value}`).join("; ") || "no change"}`;
}

