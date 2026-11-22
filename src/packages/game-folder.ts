// A game folder, both ways: the files of a download (game.yaml, each package's package.yaml and one
// CSV per tab) -> stored items, and stored items -> the same files.
// Data structure: rebuild/data-structure.md §5 (packages), §8 (download layout):
//   game.yaml
//   rulebook/package.yaml, races.csv, equipment.csv, rules.csv, common-links.csv
//   forces-of-fantasy/package.yaml, composition.csv
//   forces-of-fantasy/the-empire/package.yaml, units.csv, composition.csv, equipment.csv, rules.csv
//
// Pure: files come in and go out as { "path": "text" }; reading the disk is the caller's job.

import YAML from "yaml";
import type { ArmyList, CompositionRule, Equipment, Game, Item, Package, RaceProfile, SlotKind, SpecialRule, Unit } from "../items/items";
import { readCsv, writeCsv, type Row } from "../sheets/csv";
import { NameIndex, resolveNames, type Unmatched } from "./resolve";
import * as tabs from "./sheet-tabs";

export type Files = Record<string, string>;
export type ImportResult = { items: Item[]; problems: tabs.Problem[]; unmatched: Unmatched[] };

// The CSV each kind of item goes in, in the order files are read.
const TAB_FILES = ["races.csv", "common-links.csv", "rules.csv", "equipment.csv", "units.csv", "composition.csv"];

// --- Reading ------------------------------------------------------------------------------------

// `known` is what's already on the device: names in the upload may match it too.
export function importGameFolder(files: Files, known: Item[] = []): ImportResult {
  const problems: tabs.Problem[] = [];
  const gameFile = files["game.yaml"];
  if (gameFile === undefined) return { items: [], problems: [{ where: "game.yaml", message: "no game.yaml in the folder" }], unmatched: [] };
  const gameYaml = parseYaml(gameFile, "game.yaml", problems);
  if (!gameYaml) return { items: [], problems, unmatched: [] };
  const game = readGameYaml(gameYaml);

  const folders = Object.keys(files)
    .filter((p) => p.endsWith("package.yaml"))
    .map((p) => p.slice(0, -"package.yaml".length).replace(/\/$/, ""))
    .sort(); // parents before children
  const items: Item[] = [game];
  const packages: { pkg: Package; yaml: Record<string, unknown> }[] = [];

  for (const folder of folders) {
    const yaml = parseYaml(files[join(folder, "package.yaml")], join(folder, "package.yaml"), problems);
    if (!yaml) continue;
    const pkg = readPackageYaml(yaml, folder, game);
    packages.push({ pkg, yaml });
    items.push(pkg);
    const ctx: tabs.TabContext = { game: game.shortName, packageKey: pkg.key, packageName: pkg.name, file: "", problems };
    let armyList: ArmyList | null = null;
    for (const file of TAB_FILES) {
      const text = files[join(folder, file)];
      if (text === undefined) continue;
      ctx.file = join(folder, file);
      const rows = readCsv(text).rows;
      const read = readTab(file, rows, ctx, game.categories);
      if (read.armyList) armyList = mergeArmyList(armyList, read.armyList);
      for (const item of read.items) {
        if (item.kind === "composition-rule" && armyList) armyList.composition.push(item.key);
        pkg.members.push(item.key);
        items.push(item);
      }
    }
    if (armyList) {
      pkg.members.unshift(armyList.key);
      items.push(armyList);
    }
  }

  // Package references by name: core, part of, needs.
  const packageByName = new Map([...known, ...items].filter((i): i is Package => i.kind === "package").map((p) => [p.name, p.key]));
  const findPackage = (name: string, where: string): string => {
    const key = packageByName.get(name);
    if (!key) problems.push({ where, message: `no package called "${name}"` });
    return key ?? name;
  };
  game.core = game.core.map((n) => findPackage(n, "game.yaml, core"));
  for (const { pkg, yaml } of packages) {
    const where = join(pkg.key, "package.yaml");
    if (typeof yaml["part of"] === "string") pkg.partOf = findPackage(yaml["part of"], where);
    pkg.needsStated = asList(yaml["needs"]).map((n) => findPackage(n, where));
  }

  checkDuplicateKeys(items, known, problems);
  const unmatched = resolveNames(items, new NameIndex([...known, ...items]));
  return { items, problems, unmatched };
}

function readTab(file: string, rows: Row[], ctx: tabs.TabContext, categories: string[]): { items: Item[]; armyList: ArmyList | null } {
  if (file === "races.csv") return { items: tabs.readRaceRows(rows, ctx), armyList: null };
  if (file === "common-links.csv") return { items: tabs.readCommonLinkRows(rows, ctx), armyList: null };
  if (file === "rules.csv") return { items: tabs.readRuleRows(rows, ctx), armyList: null };
  if (file === "equipment.csv") return { items: tabs.readEquipmentRows(rows, ctx), armyList: null };
  const result = tabs.readArmyEntryRows(rows, ctx, categories);
  return { items: [...result.units, ...result.composition], armyList: result.armyList };
}

function mergeArmyList(current: ArmyList | null, next: ArmyList): ArmyList {
  if (!current) return next;
  current.entries.push(...next.entries);
  return current;
}

function checkDuplicateKeys(items: Item[], known: Item[], problems: tabs.Problem[]): void {
  const seen = new Set(known.map((i) => i.key));
  const inUpload = new Set<string>();
  for (const item of items) {
    if (inUpload.has(item.key)) problems.push({ where: item.name, message: `two items would have the key ${item.key}` });
    inUpload.add(item.key);
    if (seen.has(item.key)) problems.push({ where: item.name, message: `replaces ${item.key}, already on the device` });
  }
}

function readGameYaml(y: Record<string, any>): Game {
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
  });
}

function readPackageYaml(y: Record<string, unknown>, folder: string, game: Game): Package {
  const name = String(y["package"]);
  return dropUndefined<Package>({
    key: `${game.shortName}.${folder.split("/").pop()}`,
    kind: "package",
    name,
    game: String(y["game"] ?? game.shortName),
    layer: (y["layer"] as Package["layer"]) ?? "book",
    reference: typeof y["reference"] === "string" ? { source: y["reference"] } : undefined,
    notes: typeof y["notes"] === "string" ? y["notes"] : undefined,
    members: [],
    includes: [],
    needsStated: [],
  });
}

// --- Writing ------------------------------------------------------------------------------------

export function exportGameFolder(items: Item[]): Files {
  const files: Files = {};
  const game = items.find((i): i is Game => i.kind === "game");
  if (game) files["game.yaml"] = YAML.stringify(writeGameYaml(game, items));
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const pkg of items.filter((i): i is Package => i.kind === "package")) {
    const folder = packageFolder(pkg, byKey);
    const members = pkg.members.map((k) => byKey.get(k)).filter((i): i is Item => i !== undefined);
    const ofKind = <K extends Item["kind"]>(kind: K) => members.filter((i): i is Extract<Item, { kind: K }> => i.kind === kind);
    const parent = pkg.partOf ? (byKey.get(pkg.partOf) as Package | undefined) : undefined;
    const columns: tabs.PackageColumns = parent ? { Package: parent.name, SubPackage: pkg.name } : { Package: pkg.name, SubPackage: "Common" };
    const armyList = ofKind("army-list")[0] as ArmyList | undefined;
    const categoryOf = new Map((armyList?.entries ?? []).map((e) => [e.unit, e.category]));

    const contents: string[] = [];
    const put = (file: string, cols: string[], rows: Row[]) => {
      if (rows.length === 0) return;
      files[join(folder, file)] = writeCsv({ columns: cols, rows });
      contents.push(file.replace(".csv", "").replace("-", " "));
    };
    put("races.csv", tabs.COLUMNS.races, ofKind("race-profile").map((i) => tabs.writeRaceRow(i as RaceProfile)));
    put("common-links.csv", tabs.COLUMNS.commonLinks, ofKind("slot-kind").map((i) => tabs.writeCommonLinkRow(i as SlotKind)));
    put("rules.csv", tabs.COLUMNS.rules, ofKind("special-rule").map((i) => tabs.writeRuleRow(i as SpecialRule)));
    put("equipment.csv", tabs.COLUMNS.equipment, ofKind("equipment").map((i) => tabs.writeEquipmentRow(i as Equipment)));
    put("units.csv", tabs.COLUMNS.armyEntry, ofKind("unit").flatMap((u) => tabs.writeUnitRows(u as Unit, categoryOf.get(u.key), columns)));
    put("composition.csv", tabs.COLUMNS.armyEntry, ofKind("composition-rule").map((c) => tabs.writeCompositionRow(c as CompositionRule, columns)));
    files[join(folder, "package.yaml")] = YAML.stringify(writePackageYaml(pkg, byKey, contents));
  }
  return files;
}

function packageFolder(pkg: Package, byKey: Map<string, Item>): string {
  const own = pkg.key.split(".").slice(1).join(".");
  const parent = pkg.partOf ? byKey.get(pkg.partOf) : undefined;
  return parent && parent.kind === "package" ? join(packageFolder(parent, byKey), own) : own;
}

function nameOf(key: string, byKey: Map<string, Item>): string {
  return byKey.get(key)?.name ?? key;
}

function writeGameYaml(game: Game, items: Item[]): Record<string, unknown> {
  const byKey = new Map(items.map((i) => [i.key, i]));
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
    core: game.core.map((k) => nameOf(k, byKey)),
  });
}

function writePackageYaml(pkg: Package, byKey: Map<string, Item>, contents: string[]): Record<string, unknown> {
  return dropUndefined({
    package: pkg.name,
    game: pkg.game,
    layer: pkg.layer,
    "part of": pkg.partOf ? nameOf(pkg.partOf, byKey) : undefined,
    reference: pkg.reference?.source,
    needs: pkg.needsStated.length ? pkg.needsStated.map((k) => nameOf(k, byKey)) : undefined,
    contents,
    notes: pkg.notes,
  });
}

// --- Small helpers ------------------------------------------------------------------------------

// A YAML file as a map, or a problem (a label with a colon needs quotes: "Warhammer: the Old World").
function parseYaml(text: string, where: string, problems: tabs.Problem[]): Record<string, any> | null {
  try {
    const value = YAML.parse(text);
    if (value && typeof value === "object") return value;
    problems.push({ where, message: "expected fields (name: value), found none" });
  } catch (e) {
    problems.push({ where, message: `can't read the YAML (a value with a colon needs quotes): ${(e as Error).message.split("\n")[0]}` });
  }
  return null;
}

function join(folder: string, file: string): string {
  return folder === "" ? file : `${folder}/${file}`;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? [value] : [];
}

function dropUndefined<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;
}
