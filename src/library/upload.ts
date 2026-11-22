// Uploads and downloads: files in any of the formats -> items, and items -> files.
// Data structure: rebuild/data-structure.md §0 (in / out), §8 (layout), §9 (in the app).
//
// Upload:   .zip (a game folder) · .xlsx (one package) · .yaml (sheet YAML for a package or a game,
//           a game.yaml, or full YAML of stored items).
// Download: a game as a .zip folder or one sheet-YAML file; a package as a workbook or sheet YAML;
//           anything as full YAML.

import type { Game, Item, Package } from "../items/items";
import { slug } from "../items/keys";
import { readFullYaml, writeFullYaml } from "../packages/full-yaml";
import * as formats from "../packages/formats";
import { exportPackage, exportSheets, importSheets } from "../packages/import-export";
import type { GameSheets, TabId } from "../packages/package-sheets";
import { readXlsx } from "../sheets/xlsx";

export type UploadFile = { name: string; bytes: Uint8Array };
export type UploadResult = { items: Item[]; problems: formats.Problem[] };

export async function readUploads(files: UploadFile[], known: Item[]): Promise<UploadResult> {
  const problems: formats.Problem[] = [];
  const sheets: GameSheets = { packages: [] };
  const fullItems: Item[] = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".zip")) merge(sheets, formats.folderToSheets(await formats.zipToFolder(file.bytes), problems));
      else if (name.endsWith(".xlsx")) await readWorkbookUpload(file, sheets, problems);
      else if (name.endsWith(".yaml") || name.endsWith(".yml")) readYamlUpload(new TextDecoder().decode(file.bytes), file.name, sheets, fullItems, problems);
      else problems.push({ where: file.name, message: "not a file the app reads (.zip, .xlsx or .yaml)" });
    } catch (e) {
      problems.push({ where: file.name, message: (e as Error).message });
    }
  }
  const imported = importSheets(sheets, [...known, ...fullItems]);
  return { items: [...fullItems, ...imported.items], problems: [...problems, ...imported.problems] };
}

// A whole-game workbook has a "Packages" tab; otherwise it's one package.
async function readWorkbookUpload(file: UploadFile, sheets: GameSheets, problems: formats.Problem[]): Promise<void> {
  const tabs = await readXlsx(file.bytes);
  if (formats.isGameWorkbook(tabs)) merge(sheets, formats.workbookTabsToGame(tabs, file.name, problems));
  else sheets.packages.push(await formats.workbookToPackage(file.bytes, file.name, problems));
}

function readYamlUpload(text: string, fileName: string, sheets: GameSheets, fullItems: Item[], problems: formats.Problem[]): void {
  const doc = formats.parseYaml(text, fileName, problems);
  if (!doc) return;
  if (Array.isArray(doc.items)) {
    const full = readFullYaml(text);
    fullItems.push(...full.items);
    problems.push(...full.problems.map((message) => ({ where: fileName, message })));
  } else if (doc.package !== undefined || doc.packages !== undefined) {
    const found = formats.sheetYamlToSheets(text, fileName, problems);
    if (found) merge(sheets, found);
  } else if (doc.game !== undefined) sheets.game = doc;
  else problems.push({ where: fileName, message: 'expected "game:", "package:", "packages:" or "items:" at the top' });
}

function merge(into: GameSheets, from: GameSheets): void {
  if (from.game) into.game = from.game;
  into.packages.push(...from.packages);
}

// Reads a game folder already split into files (tests and scripts).
export function importFolder(files: formats.Files, known: Item[] = []): UploadResult {
  const problems: formats.Problem[] = [];
  const result = importSheets(formats.folderToSheets(files, problems), known);
  return { items: result.items, problems: [...problems, ...result.problems] };
}

// --- Downloads ----------------------------------------------------------------------------------

export type Download = { fileName: string; type: string; bytes: Uint8Array };

const enc = (text: string) => new TextEncoder().encode(text);
const YAML_TYPE = "application/yaml";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function gameItems(items: Item[], game: Game): Item[] {
  const keys = new Set(items.filter((i) => i.kind === "package" && i.game === game.shortName).map((p) => p.key));
  return items.filter((i) => i === game || keys.has(i.key) || (i.homePackage !== undefined && keys.has(i.homePackage)));
}

export function downloadGameZip(items: Item[], game: Game): Download {
  const files = formats.sheetsToFolder(exportSheets(gameItems(items, game)));
  return { fileName: `${game.shortName}.zip`, type: "application/zip", bytes: formats.folderToZip(files, game.shortName) };
}

export function downloadGameWorkbook(items: Item[], game: Game): Download {
  return { fileName: `${game.shortName}.xlsx`, type: XLSX_TYPE, bytes: formats.gameToWorkbook(exportSheets(gameItems(items, game))) };
}

export function downloadTabCsv(items: Item[], pkg: Package, tab: TabId): Download {
  const sheet = exportPackage(pkg, new Map(items.map((i) => [i.key, i])));
  return { fileName: `${slug(pkg.name)}-${slug(tab)}.csv`, type: "text/csv", bytes: enc(formats.tabToCsv(sheet, tab)) };
}

export function downloadGameSheetYaml(items: Item[], game: Game): Download {
  return { fileName: `${game.shortName}.yaml`, type: YAML_TYPE, bytes: enc(formats.sheetsToSheetYaml(exportSheets(gameItems(items, game)))) };
}

export function downloadPackageWorkbook(items: Item[], pkg: Package): Download {
  const sheet = exportPackage(pkg, new Map(items.map((i) => [i.key, i])));
  return { fileName: `${slug(pkg.name)}.xlsx`, type: XLSX_TYPE, bytes: formats.packageToWorkbook(sheet) };
}

export function downloadPackageSheetYaml(items: Item[], pkg: Package): Download {
  const sheet = exportPackage(pkg, new Map(items.map((i) => [i.key, i])));
  return { fileName: `${slug(pkg.name)}.yaml`, type: YAML_TYPE, bytes: enc(formats.packageToSheetYaml(sheet)) };
}

export function downloadFullYaml(items: Item[], fileName: string): Download {
  return { fileName, type: YAML_TYPE, bytes: enc(writeFullYaml(items)) };
}
