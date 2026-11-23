// Game and package sheets -> stored items, and stored items -> sheets.
// Data structure: rebuild/data-structure.md §2–5. Names are matched afterwards, across the whole
// library, by `refreshLibrary` (library.ts), which also makes the stubs.

import type { ArmyList, CompositionRule, Equipment, Game, GamePreset, GameSetting, Item, MagicItem, Package, Patch, RaceProfile, SettingValue, SlotKind, Source, SpecialRule, Unit } from "../items/items";
import { slug } from "../items/keys";
import type { Row } from "../sheets/csv";
import { PATCH_TABS, TABS, type GameSheets, type PackageSheets, type TabId } from "./package-sheets";
import * as tabs from "./sheet-tabs";
import { readPatchRows, writePatchRows } from "./patch-tabs";

export type ImportResult = { items: Item[]; problems: tabs.Problem[] };

// --- Reading ------------------------------------------------------------------------------------

// `known` is what's on the device already: an upload of packages only finds its game there,
// and package names (part of, needs, core) may refer to packages already loaded.
export function importSheets(sheets: GameSheets, known: Item[] = []): ImportResult {
  const problems: tabs.Problem[] = [];
  const items: Item[] = [];
  let game: Game | undefined;
  if (sheets.game) {
    game = readGameInfo(sheets.game);
    items.push(game);
  }

  const packages: { pkg: Package; info: Record<string, unknown> }[] = [];
  const parentsFirst = [...sheets.packages].sort((a, b) => a.folder.localeCompare(b.folder));
  for (const sheet of parentsFirst) {
    const shortName = String(sheet.info["game"] ?? game?.shortName ?? "");
    const gameHere = game?.shortName === shortName ? game : known.find((i): i is Game => i.kind === "game" && i.shortName === shortName);
    if (!gameHere) {
      problems.push({ where: sheet.folder, message: `the game "${shortName}" isn't on the device: upload the game first` });
      continue;
    }
    const pkg = readPackageInfo(sheet, gameHere);
    packages.push({ pkg, info: sheet.info });
    items.push(pkg, ...readPackageTabs(sheet, pkg, gameHere, problems));
  }

  // Package names (core, part of, needs) to keys.
  const byName = new Map([...known, ...items].filter((i): i is Package => i.kind === "package").map((p) => [p.name, p.key]));
  const findPackage = (name: string, where: string): string => {
    const key = byName.get(name);
    if (!key) problems.push({ where, message: `no package called "${name}"` });
    return key ?? name;
  };
  if (game) game.core = game.core.map((n) => findPackage(n, "game.yaml, core"));
  if (game?.defaultComposition) game.defaultComposition = game.defaultComposition.map((n) => findPackage(n, "game.yaml, default composition"));
  for (const { pkg, info } of packages) {
    const where = `${pkg.key}, package settings`;
    if (typeof info["part of"] === "string") pkg.partOf = findPackage(info["part of"], where);
    if (typeof info["corrects"] === "string") pkg.corrects = findPackage(info["corrects"], where);
    pkg.needsStated = asList(info["needs"]).map((n) => findPackage(n, where));
  }

  checkDuplicateKeys(items, problems);
  return { items, problems };
}

function readPackageTabs(sheet: PackageSheets, pkg: Package, game: Game, problems: tabs.Problem[]): Item[] {
  const ctx: tabs.TabContext = { game: game.shortName, packageKey: pkg.key, packageName: pkg.name, file: "", problems };
  const items: Item[] = [];
  const army: { list: ArmyList | null } = { list: null };
  const patches = new Map<string, Patch>(); // by name: rows sharing a name are one patch, across tabs
  for (const tab of TABS) {
    const typed = sheet.tabs[tab.id];
    if (!typed || typed.length === 0) continue;
    // Every column present, blank where the upload left it out.
    const rows = typed.map((r) => Object.fromEntries(tab.columns.map((c) => [c, r[c] ?? ""])));
    ctx.file = `${sheet.folder}/${tab.file}`;
    if (tab.id in PATCH_TABS) {
      readPatchRows(PATCH_TABS[tab.id as keyof typeof PATCH_TABS], rows, ctx, patches);
      continue;
    }
    for (const item of readTab(tab.id, rows, ctx, game.categories, (list) => (army.list = mergeArmyList(army.list, list)))) {
      if (item.kind === "composition-rule" && army.list) army.list.composition.push(item.key);
      pkg.members.push(item.key);
      items.push(item);
    }
  }
  if (army.list) {
    pkg.members.unshift(army.list.key);
    items.push(army.list);
  }
  for (const patch of patches.values()) {
    pkg.members.push(patch.key);
    items.push(patch);
  }
  return items;
}

function readTab(id: TabId, rows: Row[], ctx: tabs.TabContext, categories: string[], onArmyList: (list: ArmyList) => void): Item[] {
  if (id === "bibliography") return tabs.readSourceRows(rows, ctx);
  if (id === "settings") return tabs.readSettingRows(rows, ctx);
  if (id === "races") return tabs.readRaceRows(rows, ctx);
  if (id === "common links") return tabs.readCommonLinkRows(rows, ctx);
  if (id === "rules") return tabs.readRuleRows(rows, ctx);
  if (id === "equipment") return tabs.readEquipmentRows(rows, ctx);
  if (id === "magic items") return tabs.readMagicItemRows(rows, ctx);
  const result = tabs.readArmyEntryRows(rows, ctx, categories);
  if (result.armyList) onArmyList(result.armyList);
  return [...result.units, ...result.composition];
}

function mergeArmyList(current: ArmyList | null, next: ArmyList): ArmyList {
  if (!current) return next;
  current.entries.push(...next.entries);
  return current;
}

function checkDuplicateKeys(items: Item[], problems: tabs.Problem[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) problems.push({ where: item.name, message: `two items would have the key ${item.key}` });
    seen.add(item.key);
  }
}

function readGameInfo(y: Record<string, any>): Game {
  const shortName = String(y["short name"]);
  return dropUndefined<Game>({
    key: shortName,
    kind: "game",
    name: String(y["game"]),
    shortName,
    statlines: y["statlines"],
    bounds: y["bounds"],
    measures: y["measures"] ?? [],
    categories: y["categories"] ?? [],
    sections: y["sections"],
    troopTypes: y["troop types"],
    roles: y["roles"],
    bagOrder: y["bag order"] ?? [],
    core: asList(y["core"]),
    defaultComposition: y["default composition"] === undefined ? undefined : asList(y["default composition"]),
    settings: Array.isArray(y["settings"]) ? y["settings"].map(readGameSetting) : undefined,
    presets: Array.isArray(y["presets"]) ? y["presets"].map(readPreset) : undefined,
  });
}

function readPreset(y: Record<string, any>): GamePreset {
  const list = (v: unknown) => (v === undefined ? undefined : asList(v));
  return dropUndefined<GamePreset>({
    name: String(y["name"]),
    about: y["about"] === undefined ? undefined : String(y["about"]),
    books: list(y["books"]),
    armies: y["armies"] === "all" ? "all" : undefined,
    faqs: list(y["faqs"]),
    house: list(y["house"]),
    composition: list(y["composition"]),
    settings: y["settings"] ?? undefined,
  });
}

function readGameSetting(y: Record<string, any>): GameSetting {
  const choices: Record<string, string> = {};
  for (const [label, value] of Object.entries(y["choices"] ?? {})) choices[label] = String(value);
  const setting: GameSetting = { name: String(y["name"]), default: String(y["default"] ?? ""), choices };
  if (y["about"]) setting.about = String(y["about"]);
  return setting;
}

function readPackageInfo(sheet: PackageSheets, game: Game): Package {
  const y = sheet.info;
  const name = String(y["package"] ?? sheet.folder);
  const folder = sheet.folder || slug(name);
  return dropUndefined<Package>({
    key: `${game.shortName}.${folder.split("/").pop()}`,
    kind: "package",
    name,
    game: game.shortName,
    layer: (y["layer"] as Package["layer"]) ?? "book",
    reference: typeof y["reference"] === "string" ? { source: y["reference"] } : undefined,
    notes: typeof y["notes"] === "string" ? y["notes"] : undefined,
    section: typeof y["section"] === "string" ? y["section"] : undefined,
    version: y["version"] === undefined ? undefined : String(y["version"]),
    members: [],
    includes: [],
    needsStated: [],
  });
}

// --- Writing ------------------------------------------------------------------------------------

// Every package except the stub packages, which are made again from the names on every import.
export function exportSheets(items: Item[], onlyPackages?: string[]): GameSheets {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const game = items.find((i): i is Game => i.kind === "game");
  const packages = items
    .filter((i): i is Package => i.kind === "package" && !i.stubsFor)
    .filter((p) => !onlyPackages || onlyPackages.includes(p.key))
    .map((p) => exportPackage(p, byKey));
  return { game: game && !onlyPackages ? writeGameInfo(game, byKey) : undefined, packages };
}

export function exportPackage(pkg: Package, byKey: Map<string, Item>): PackageSheets {
  const members = pkg.members.map((k) => byKey.get(k)).filter((i): i is Item => i !== undefined);
  const ofKind = <K extends Item["kind"]>(kind: K) => members.filter((i): i is Extract<Item, { kind: K }> => i.kind === kind);
  const parent = pkg.partOf ? (byKey.get(pkg.partOf) as Package | undefined) : undefined;
  const columns: tabs.PackageColumns = parent ? { Package: parent.name, SubPackage: pkg.name } : { Package: pkg.name, SubPackage: "Common" };
  const armyList = ofKind("army-list")[0] as ArmyList | undefined;
  const categoryOf = new Map((armyList?.entries ?? []).map((e) => [e.unit, e.category]));

  const sheetTabs: PackageSheets["tabs"] = {};
  const put = (id: TabId, rows: Row[]) => {
    if (rows.length > 0) sheetTabs[id] = rows;
  };
  put("bibliography", ofKind("source").map((i) => tabs.writeSourceRow(i as Source)));
  put("settings", ofKind("setting").map((i) => tabs.writeSettingRow(i as SettingValue)));
  put("races", ofKind("race-profile").map((i) => tabs.writeRaceRow(i as RaceProfile)));
  put("common links", ofKind("slot-kind").map((i) => tabs.writeCommonLinkRow(i as SlotKind)));
  put("rules", ofKind("special-rule").map((i) => tabs.writeRuleRow(i as SpecialRule)));
  put("equipment", ofKind("equipment").map((i) => tabs.writeEquipmentRow(i as Equipment)));
  put("magic items", ofKind("magic-item").map((i) => tabs.writeMagicItemRow(i as MagicItem)));
  put("units", ofKind("unit").flatMap((u) => tabs.writeUnitRows(u as Unit, categoryOf.get(u.key), columns)));
  put("composition", ofKind("composition-rule").map((c) => tabs.writeCompositionRow(c as CompositionRule, columns)));
  for (const [id, kind] of Object.entries(PATCH_TABS)) put(id as TabId, ofKind("patch").flatMap((p) => writePatchRows(p as Patch, kind)));

  const info = dropUndefined<Record<string, unknown>>({
    package: pkg.name,
    game: pkg.game,
    layer: pkg.layer,
    "part of": parent?.name,
    reference: pkg.reference?.source,
    needs: pkg.needsStated.length ? pkg.needsStated.map((k) => byKey.get(k)?.name ?? k) : undefined,
    section: pkg.section,
    corrects: pkg.corrects ? byKey.get(pkg.corrects)?.name ?? pkg.corrects : undefined,
    version: pkg.version,
    notes: pkg.notes,
  });
  return { folder: packageFolder(pkg, byKey), info, tabs: sheetTabs };
}

export function packageFolder(pkg: Package, byKey: Map<string, Item>): string {
  const own = pkg.key.split(".").slice(1).join(".");
  const parent = pkg.partOf ? byKey.get(pkg.partOf) : undefined;
  return parent && parent.kind === "package" ? `${packageFolder(parent, byKey)}/${own}` : own;
}

function writeGameInfo(game: Game, byKey: Map<string, Item>): Record<string, unknown> {
  return dropUndefined({
    game: game.name,
    "short name": game.shortName,
    statlines: game.statlines,
    bounds: game.bounds,
    measures: game.measures,
    categories: game.categories,
    sections: game.sections,
    "troop types": game.troopTypes,
    roles: game.roles,
    "bag order": game.bagOrder,
    core: game.core.map((k) => byKey.get(k)?.name ?? k),
    "default composition": game.defaultComposition?.map((k) => byKey.get(k)?.name ?? k),
    settings: game.settings,
    presets: game.presets,
  });
}

// --- Small helpers ------------------------------------------------------------------------------

export function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" && value.trim() !== "" ? value.split(/\s*;\s*/) : [];
}

function dropUndefined<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;
}
