// The in-between shape every upload and download format converts to and from: a game's settings
// plus, for each package, its settings and its tabs of rows as typed.
// A folder of CSVs, a workbook, sheet-shaped YAML: each is just a way of writing this down.
// Data structure: rebuild/data-structure.md §0 (in / out layer), §8 (download layout).

import type { Row } from "../sheets/csv";
import { COLUMNS } from "./sheet-tabs";

// The tabs, in the order they're read (things a tab names come before it).
export const TABS = [
  { id: "races", file: "races.csv", title: "Races", columns: COLUMNS.races },
  { id: "common links", file: "common-links.csv", title: "Common Links", columns: COLUMNS.commonLinks },
  { id: "rules", file: "rules.csv", title: "Rules", columns: COLUMNS.rules },
  { id: "equipment", file: "equipment.csv", title: "Equipment", columns: COLUMNS.equipment },
  { id: "units", file: "units.csv", title: "Units", columns: COLUMNS.armyEntry },
  { id: "composition", file: "composition.csv", title: "Composition", columns: COLUMNS.armyEntry },
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

export function tabByFile(file: string) {
  return TABS.find((t) => t.file === file);
}

export function tabByTitle(title: string) {
  const t = title.trim().toLowerCase();
  return TABS.find((tab) => tab.title.toLowerCase() === t || tab.id === t || tab.file === t);
}
