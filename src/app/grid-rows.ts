// A package's items of one kind as spreadsheet rows, each tied to its item: what the grid view shows.
// The rows are exactly the sheet's (the same writers as a download), so the grid and the workbook
// always agree. Data structure: rebuild/data-structure.md §9.

import type { ArmyList, CompositionRule, Equipment, Item, Package, RaceProfile, SettingValue, SlotKind, Source, SpecialRule, Unit } from "../items/items";
import type { Row } from "../sheets/csv";
import { TABS, type TabId } from "../packages/package-sheets";
import * as tabs from "../packages/sheet-tabs";

export const KIND_OF_TAB: Record<TabId, Item["kind"]> = {
  bibliography: "source",
  settings: "setting",
  races: "race-profile",
  "common links": "slot-kind",
  rules: "special-rule",
  equipment: "equipment",
  units: "unit",
  composition: "composition-rule",
};

export type GridRow = { key: string; row: Row; first: boolean };
export type Grid = { columns: string[]; rows: GridRow[] };

// Columns the app works out itself are left off the grid; so are columns empty on every row.
const HIDDEN = new Set(["Package", "SubPackage", "Rule Type", "Key"]);

export function gridFor(pkg: Package, tab: TabId, byKey: Map<string, Item>): Grid {
  const members = pkg.members.map((k) => byKey.get(k)).filter((i): i is Item => i !== undefined);
  const parent = pkg.partOf ? (byKey.get(pkg.partOf) as Package | undefined) : undefined;
  const columns: tabs.PackageColumns = parent ? { Package: parent.name, SubPackage: pkg.name } : { Package: pkg.name, SubPackage: "Common" };
  const list = members.find((i): i is ArmyList => i.kind === "army-list");
  const categoryOf = new Map((list?.entries ?? []).map((e) => [e.unit, e.category]));
  const rows: GridRow[] = [];
  for (const item of members.filter((i) => i.kind === KIND_OF_TAB[tab])) {
    rowsOf(item, columns, categoryOf).forEach((row, i) => rows.push({ key: item.key, row, first: i === 0 }));
  }
  const all = TABS.find((t) => t.id === tab)!.columns;
  return { columns: all.filter((c) => !HIDDEN.has(c) && rows.some((r) => (r.row[c] ?? "") !== "")), rows };
}

function rowsOf(item: Item, columns: tabs.PackageColumns, categoryOf: Map<string, string>): Row[] {
  switch (item.kind) {
    case "source":
      return [tabs.writeSourceRow(item as Source)];
    case "setting":
      return [tabs.writeSettingRow(item as SettingValue)];
    case "race-profile":
      return [tabs.writeRaceRow(item as RaceProfile)];
    case "slot-kind":
      return [tabs.writeCommonLinkRow(item as SlotKind)];
    case "special-rule":
      return [tabs.writeRuleRow(item as SpecialRule)];
    case "equipment":
      return [tabs.writeEquipmentRow(item as Equipment)];
    case "unit":
      return tabs.writeUnitRows(item as Unit, categoryOf.get(item.key), columns);
    case "composition-rule":
      return [tabs.writeCompositionRow(item as CompositionRule, columns)];
    default:
      return [];
  }
}

// How many items of each tab a package holds.
export function tabCounts(pkg: Package, byKey: Map<string, Item>): { tab: TabId; title: string; count: number }[] {
  return TABS.map((t) => ({
    tab: t.id,
    title: t.title,
    count: pkg.members.filter((k) => byKey.get(k)?.kind === KIND_OF_TAB[t.id]).length,
  })).filter((c) => c.count > 0);
}
