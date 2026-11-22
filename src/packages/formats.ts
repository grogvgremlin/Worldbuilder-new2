// The upload and download formats, each converting to and from GameSheets / PackageSheets:
//   - a folder: game.yaml, and per package a package.yaml and one CSV per tab (also as one .zip);
//   - a workbook (.xlsx): one package, a "Package" tab for its settings, then a tab per kind;
//   - sheet YAML: the same rows, each as "column: cell", for a package or a whole game in one file.
// Data structure: rebuild/data-structure.md §0, §8.

import YAML from "yaml";
import { readCsv, writeCsv, type Row } from "../sheets/csv";
import { readXlsx, writeXlsx, type WorkbookTab } from "../sheets/xlsx";
import { readZip, writeZip } from "../sheets/zip";
import { TABS, tabByFile, tabByTitle, type GameSheets, type PackageSheets, type TabId } from "./package-sheets";

export type Files = Record<string, string>; // path -> text
export type Problem = { where: string; message: string };

// The settings a package carries, in the order they're written.
const PACKAGE_FIELDS = ["package", "folder", "game", "layer", "part of", "reference", "needs", "notes"];

// --- Folder (and zip) ---------------------------------------------------------------------------

export function folderToSheets(files: Files, problems: Problem[]): GameSheets {
  const sheets: GameSheets = { packages: [] };
  if (files["game.yaml"] !== undefined) sheets.game = parseYaml(files["game.yaml"], "game.yaml", problems) ?? undefined;
  const folders = Object.keys(files)
    .filter((p) => p === "package.yaml" || p.endsWith("/package.yaml"))
    .map((p) => p.slice(0, -"package.yaml".length).replace(/\/$/, ""));
  for (const folder of folders) {
    const info = parseYaml(files[join(folder, "package.yaml")], join(folder, "package.yaml"), problems);
    if (!info) continue;
    const pkg: PackageSheets = { folder, info, tabs: {} };
    for (const [path, text] of Object.entries(files)) {
      const at = path.lastIndexOf("/");
      if ((at < 0 ? "" : path.slice(0, at)) !== folder) continue;
      const tab = tabByFile(path.slice(at + 1));
      if (tab) pkg.tabs[tab.id] = readCsv(text).rows;
    }
    sheets.packages.push(pkg);
  }
  return sheets;
}

export function sheetsToFolder(sheets: GameSheets): Files {
  const files: Files = {};
  if (sheets.game) files["game.yaml"] = YAML.stringify(sheets.game);
  for (const pkg of sheets.packages) {
    const info = { ...pkg.info, contents: TABS.filter((t) => pkg.tabs[t.id]).map((t) => t.id) };
    files[join(pkg.folder, "package.yaml")] = YAML.stringify(info);
    for (const tab of TABS) {
      const rows = pkg.tabs[tab.id];
      if (rows) files[join(pkg.folder, tab.file)] = writeCsv({ columns: [...tab.columns], rows });
    }
  }
  return files;
}

// A zip holds the folder, possibly inside a top folder of its own ("tow/game.yaml").
export async function zipToFolder(bytes: Uint8Array): Promise<Files> {
  const zip = await readZip(bytes);
  const paths = Object.keys(zip).filter((p) => !p.startsWith("__MACOSX/"));
  const anchor = paths.find((p) => p.endsWith("game.yaml")) ?? paths.find((p) => p.endsWith("package.yaml")) ?? "";
  const top = anchor.includes("/") && anchor.endsWith("game.yaml") ? anchor.slice(0, anchor.lastIndexOf("/") + 1) : "";
  const files: Files = {};
  for (const p of paths) if (p.startsWith(top)) files[p.slice(top.length)] = new TextDecoder().decode(zip[p]);
  return files;
}

export function folderToZip(files: Files, topFolder: string): Uint8Array {
  const zip: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(files)) zip[`${topFolder}/${path}`] = new TextEncoder().encode(text);
  return writeZip(zip);
}

// --- Workbook: one package ---------------------------------------------------------------------

export function packageToWorkbook(pkg: PackageSheets): Uint8Array {
  const settings: string[][] = [["Field", "Value"]];
  const info: Record<string, unknown> = { ...pkg.info, folder: pkg.folder };
  for (const field of PACKAGE_FIELDS) {
    const value = info[field];
    if (value !== undefined) settings.push([field, Array.isArray(value) ? value.join("; ") : String(value)]);
  }
  const tabs: WorkbookTab[] = [{ name: "Package", rows: settings }];
  for (const tab of TABS) {
    const rows = pkg.tabs[tab.id];
    if (rows) tabs.push({ name: tab.title, rows: [[...tab.columns], ...rows.map((r) => tab.columns.map((c) => r[c] ?? ""))] });
  }
  return writeXlsx(tabs);
}

export async function workbookToPackage(bytes: Uint8Array, fileName: string, problems: Problem[]): Promise<PackageSheets> {
  const tabs = await readXlsx(bytes);
  const pkg: PackageSheets = { folder: "", info: {}, tabs: {} };
  for (const tab of tabs) {
    if (tab.name.trim().toLowerCase() === "package") {
      for (const [field, value] of tab.rows.slice(1)) if (field && value) pkg.info[field.trim().toLowerCase()] = value.trim();
      continue;
    }
    const known = tabByTitle(tab.name);
    if (!known) {
      problems.push({ where: `${fileName}, tab ${tab.name}`, message: "not a tab the app reads (left out)" });
      continue;
    }
    const [header = [], ...body] = tab.rows;
    const columns = header.map((c) => c.trim());
    pkg.tabs[known.id] = body
      .filter((r) => r.some((c) => c.trim() !== ""))
      .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
  }
  pkg.folder = String(pkg.info["folder"] ?? "");
  delete pkg.info["folder"];
  if (!pkg.info["package"]) problems.push({ where: fileName, message: 'no "Package" tab with the package\'s name' });
  return pkg;
}

// --- Sheet YAML: rows as "column: cell" --------------------------------------------------------

export function sheetsToSheetYaml(sheets: GameSheets): string {
  const doc: Record<string, unknown> = {};
  if (sheets.game) doc.game = sheets.game;
  doc.packages = sheets.packages.map(packageToYamlObject);
  return YAML.stringify(doc, { lineWidth: 0 });
}

export function packageToSheetYaml(pkg: PackageSheets): string {
  return YAML.stringify(packageToYamlObject(pkg), { lineWidth: 0 });
}

function packageToYamlObject(pkg: PackageSheets): Record<string, unknown> {
  const out: Record<string, unknown> = { package: pkg.info["package"], folder: pkg.folder };
  for (const [k, v] of Object.entries(pkg.info)) if (k !== "package") out[k] = v;
  for (const tab of TABS) {
    const rows = pkg.tabs[tab.id];
    if (rows) out[tab.id] = rows.map(rowToYaml);
  }
  return out;
}

// Only the cells with something in them; the Package, SubPackage and Key columns are worked out.
function rowToYaml(row: Row): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [column, cell] of Object.entries(row)) {
    if (cell === "" || column === "Package" || column === "SubPackage" || column === "Key") continue;
    out[column] = /^(0|[1-9]\d{0,14})$/.test(cell) ? Number(cell) : cell;
  }
  return out;
}

// A whole game ({ game, packages }) or one package ({ package, … }).
export function sheetYamlToSheets(text: string, where: string, problems: Problem[]): GameSheets | null {
  const doc = parseYaml(text, where, problems);
  if (!doc) return null;
  if (Array.isArray(doc.packages)) {
    return { game: doc.game ?? undefined, packages: doc.packages.map((p: Record<string, unknown>) => yamlObjectToPackage(p)) };
  }
  if (doc.package !== undefined) return { packages: [yamlObjectToPackage(doc)] };
  problems.push({ where, message: 'expected "package:" or "packages:" at the top' });
  return null;
}

function yamlObjectToPackage(obj: Record<string, unknown>): PackageSheets {
  const pkg: PackageSheets = { folder: String(obj.folder ?? ""), info: {}, tabs: {} };
  for (const [key, value] of Object.entries(obj)) {
    const tab = TABS.find((t) => t.id === key);
    if (tab && Array.isArray(value)) pkg.tabs[tab.id as TabId] = value.map((r) => yamlToRow(r, [...tab.columns]));
    else if (key !== "folder" && key !== "contents") pkg.info[key] = value;
  }
  return pkg;
}

function yamlToRow(obj: Record<string, unknown>, columns: string[]): Row {
  const row: Row = {};
  for (const c of columns) row[c] = obj[c] === undefined || obj[c] === null ? "" : String(obj[c]);
  return row;
}

// --- Small helpers ------------------------------------------------------------------------------

function join(folder: string, file: string): string {
  return folder === "" ? file : `${folder}/${file}`;
}

// A YAML file as a map, or a problem (a value with a colon needs quotes: "Warhammer: the Old World").
export function parseYaml(text: string, where: string, problems: Problem[]): Record<string, any> | null {
  try {
    const value = YAML.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    problems.push({ where, message: "expected fields (name: value), found none" });
  } catch (e) {
    problems.push({ where, message: `can't read the YAML (a value with a colon needs quotes): ${(e as Error).message.split("\n")[0]}` });
  }
  return null;
}

// --- Workbook: a whole game --------------------------------------------------------------------
// Tabs: "Game" (its settings, one per row), "Packages" (one row per package), then a tab per kind
// with an "In package" column first saying which package each row belongs to.

const PACKAGES_COLUMNS = ["Package", "Folder", "Game", "Layer", "Part of", "Reference", "Needs", "Notes"];
const IN_PACKAGE = "In package";

export function gameToWorkbook(sheets: GameSheets): Uint8Array {
  const tabs: WorkbookTab[] = [];
  if (sheets.game) {
    const rows: string[][] = [["Field", "Value"]];
    for (const [field, value] of Object.entries(sheets.game)) rows.push([field, typeof value === "string" ? value : YAML.stringify(value, { collectionStyle: "flow" }).trim()]);
    tabs.push({ name: "Game", rows });
  }
  const packageRows = sheets.packages.map((p) => {
    const info: Record<string, unknown> = { ...p.info, folder: p.folder };
    return PACKAGES_COLUMNS.map((c) => {
      const v = info[c.toLowerCase()];
      return v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    });
  });
  tabs.push({ name: "Packages", rows: [PACKAGES_COLUMNS, ...packageRows] });
  for (const tab of TABS) {
    const rows: string[][] = [];
    for (const p of sheets.packages) for (const r of p.tabs[tab.id] ?? []) rows.push([String(p.info["package"]), ...tab.columns.map((c) => r[c] ?? "")]);
    if (rows.length) tabs.push({ name: tab.title, rows: [[IN_PACKAGE, ...tab.columns], ...rows] });
  }
  return writeXlsx(tabs);
}

export function isGameWorkbook(tabs: WorkbookTab[]): boolean {
  return tabs.some((t) => t.name.trim().toLowerCase() === "packages");
}

export function workbookTabsToGame(tabs: WorkbookTab[], fileName: string, problems: Problem[]): GameSheets {
  const sheets: GameSheets = { packages: [] };
  const byName = new Map<string, PackageSheets>();
  for (const tab of tabs) {
    const title = tab.name.trim().toLowerCase();
    const [header = [], ...body] = tab.rows;
    const columns = header.map((c) => c.trim());
    const rows = body.filter((r) => r.some((c) => c.trim() !== "")).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
    if (title === "game") {
      sheets.game = {};
      for (const r of rows) sheets.game[r["Field"]] = readSettingValue(r["Value"]);
    } else if (title === "packages") {
      for (const r of rows) {
        const info: Record<string, unknown> = {};
        for (const c of PACKAGES_COLUMNS) if (r[c] && c !== "Folder") info[c.toLowerCase()] = r[c];
        const pkg: PackageSheets = { folder: r["Folder"] ?? "", info, tabs: {} };
        byName.set(r["Package"], pkg);
        sheets.packages.push(pkg);
      }
    } else {
      const known = tabByTitle(tab.name);
      if (!known) {
        problems.push({ where: `${fileName}, tab ${tab.name}`, message: "not a tab the app reads (left out)" });
        continue;
      }
      for (const r of rows) {
        const pkg = byName.get(r[IN_PACKAGE]);
        if (!pkg) {
          problems.push({ where: `${fileName}, tab ${tab.name}`, message: `"${r[IN_PACKAGE]}" isn't on the Packages tab` });
          continue;
        }
        (pkg.tabs[known.id] ??= []).push(r);
      }
    }
  }
  return sheets;
}

// A setting written as text, or as YAML for a list or a map ("[M, WS, BS]").
function readSettingValue(text: string): unknown {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return t;
  try {
    return YAML.parse(t);
  } catch {
    return t;
  }
}

// One tab of one package as CSV.
export function tabToCsv(pkg: PackageSheets, tab: TabId): string {
  const def = TABS.find((t) => t.id === tab)!;
  return writeCsv({ columns: [...def.columns], rows: pkg.tabs[tab] ?? [] });
}
