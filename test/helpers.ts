// Shared steps for the tests: a folder on disk -> the library, and the library -> a folder.
import { refreshLibrary } from "../src/library/library";
import { importFolder } from "../src/library/upload";
import { exportSheets } from "../src/packages/import-export";
import { sheetsToFolder } from "../src/packages/formats";
import type { Item } from "../src/items/items";

export function loadFolder(files: Record<string, string>, known: Item[] = []) {
  const read = importFolder(files, known);
  const refreshed = refreshLibrary([...known, ...read.items]);
  return { items: refreshed.items, problems: read.problems, stubbed: refreshed.stubbed };
}

export function saveFolder(items: Item[]) {
  return sheetsToFolder(exportSheets(items));
}

// Cell-by-cell differences between two folders' CSVs (the Key column left out; options cells may
// lose a space before a bracket).
export function cellDifferences(before: Record<string, string>, after: Record<string, string>, readCsv: (t: string) => { rows: Record<string, string>[] }): string[] {
  const diffs: string[] = [];
  for (const [path, text] of Object.entries(before)) {
    if (!path.endsWith(".csv")) continue;
    const a = readCsv(text).rows;
    const b = readCsv(after[path] ?? "").rows;
    if (a.length !== b.length) diffs.push(`${path}: ${a.length} rows, now ${b.length}`);
    a.forEach((row, i) => {
      for (const [col, cell] of Object.entries(row)) {
        if (col === "Key") continue;
        const expected = col.endsWith("Options") ? cell.trim().replace(/ \(/g, "(") : cell.trim();
        const now = b[i]?.[col] ?? "";
        if (expected !== now) diffs.push(`${path} row ${i + 2} ${col}: "${cell}" -> "${now}"`);
      }
    });
  }
  return diffs;
}
