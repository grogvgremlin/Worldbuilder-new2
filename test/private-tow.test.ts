// The whole TOW data from the private data repo: import, then both round trips.
// Skipped where ../worldbuilder-data isn't checked out (the data is private and never in this repo).
import { describe, expect, it } from "vitest";
import { importGameFolder, exportGameFolder } from "../src/packages/game-folder";
import { readFullYaml, writeFullYaml } from "../src/packages/full-yaml";
import { foundNeeds } from "../src/packages/resolve";
import { readCsv } from "../src/sheets/csv";
import type { Package } from "../src/items/items";
import { hasTowData, readFolder, TOW_DATA } from "./read-folder";

describe.skipIf(!hasTowData)("TOW data from the data repo", () => {
  const files = readFolder(TOW_DATA);
  const first = importGameFolder(files);

  it("imports with no problems", () => {
    expect(first.problems).toEqual([]);
  });

  it("exports to sheets and imports back to the same items", () => {
    const again = importGameFolder(exportGameFolder(first.items));
    expect(again.problems).toEqual([]);
    expect(again.items).toEqual(first.items);
  });

  it("writes full YAML and reads back the same items", () => {
    const back = readFullYaml(writeFullYaml(first.items));
    expect(back.problems).toEqual([]);
    expect(back.items).toEqual(first.items);
  });

  it("finds what The Empire needs from what its units name", () => {
    const empire = first.items.find((i) => i.key === "tow.the-empire") as Package;
    const needs = foundNeeds(empire, first.items);
    expect([...needs.keys()].sort()).toEqual(["tow.rulebook"]);
    expect(needs.get("tow.rulebook")).toContain("Close Order");
    expect(empire.needsStated).toEqual(["tow.forces-of-fantasy"]);
  });

  it("gives back the cells as typed (differences listed)", () => {
    const out = exportGameFolder(first.items);
    const diffs: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      if (!path.endsWith(".csv")) continue;
      const before = readCsv(text).rows;
      const after = readCsv(out[path] ?? "").rows;
      if (before.length !== after.length) diffs.push(`${path}: ${before.length} rows, now ${after.length}`);
      before.forEach((row, i) => {
        for (const [col, cell] of Object.entries(row)) {
          if (col === "Key") continue;
          const now = after[i]?.[col] ?? "";
          // The one change allowed: a space before a bracket ("Magic Standard (" -> "Magic Standard(").
          const expected = col.endsWith("Options") ? cell.trim().replace(/ \(/g, "(") : cell.trim();
          if (expected !== now) diffs.push(`${path} row ${i + 2} ${col}: "${cell}" -> "${now}"`);
        }
      });
    }
    expect(diffs).toEqual([]);
  });
});
