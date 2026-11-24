// The in-between shape every upload and download format converts to and from: a game's settings
// plus, for each package, its settings and its tabs of rows as typed.
// A folder of CSVs, a workbook, sheet-shaped YAML: each is just a way of writing this down.
// Data structure: rebuild/data-structure.md §0 (in / out layer), §8 (download layout).

import type { Row } from "../sheets/csv";
import { COLUMNS } from "./sheet-tabs";
import { PATCH_COLUMNS } from "./patch-tabs";

// The tabs, in the order they're read (things a tab names come before it).
export const TABS = [
  { id: "bibliography", file: "bibliography.csv", title: "Bibliography", columns: COLUMNS.bibliography },
  { id: "settings", file: "settings.csv", title: "Settings", columns: COLUMNS.settings },
  { id: "races", file: "races.csv", title: "Races", columns: COLUMNS.races },
  { id: "common links", file: "common-links.csv", title: "Common Links", columns: COLUMNS.commonLinks },
  { id: "rules", file: "rules.csv", title: "Rules", columns: COLUMNS.rules },
  { id: "equipment", file: "equipment.csv", title: "Equipment", columns: COLUMNS.equipment },
  { id: "magic items", file: "magic-items.csv", title: "Magic Items", columns: COLUMNS.magicItems },
  { id: "units", file: "units.csv", title: "Units", columns: COLUMNS.armyEntry },
  { id: "composition", file: "composition.csv", title: "Composition", columns: COLUMNS.armyEntry },
  // Patches: changes to what's entered above (or in another package), in order.
  { id: "unit patches", file: "unit-patches.csv", title: "Unit Patches", columns: PATCH_COLUMNS.unit },
  { id: "equipment patches", file: "equipment-patches.csv", title: "Equipment Patches", columns: PATCH_COLUMNS.equipment },
  { id: "rule patches", file: "rule-patches.csv", title: "Rule Patches", columns: PATCH_COLUMNS["special-rule"] },
  { id: "composition patches", file: "composition-patches.csv", title: "Composition Patches", columns: PATCH_COLUMNS["composition-rule"] },
] as const;

export type TabId = (typeof TABS)[number]["id"];

// One package: where it sits in the download layout, its package.yaml fields, its tabs.
export type PackageSheets = {
  folder: string; // forces-of-fantasy/the-empire
  info: Record<string, unknown>; // package, game, layer, part of, reference, needs, notes
  tabs: Partial<Record<TabId, Row[]>>;
};

// A game's settings (game.yaml) and its packages. `game` is absent when only packages are uploaded
// and the game is already on the device.
export type GameSheets = {
  game?: Record<string, unknown>;
  packages: PackageSheets[];
};

// Which kind of change each patch tab holds.
export const PATCH_TABS = { "unit patches": "unit", "equipment patches": "equipment", "rule patches": "special-rule", "composition patches": "composition-rule" } as const;

// A tab's columns, and after them any others its rows hold (a 4th race dimension, say), so nothing
// the owner added is lost on the way out.
export function columnsFor(tab: { columns: readonly string[] }, rows: Row[]): string[] {
  const out = [...tab.columns];
  for (const r of rows) for (const c of Object.keys(r)) if (!out.includes(c)) out.push(c);
  return out;
}

export function tabByFile(file: string) {
  return TABS.find((t) => t.file === file);
}

export function tabByTitle(title: string) {
  const t = title.trim().toLowerCase();
  return TABS.find((tab) => tab.title.toLowerCase() === t || tab.id === t || tab.file === t);
}
