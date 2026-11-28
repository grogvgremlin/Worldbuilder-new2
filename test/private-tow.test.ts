// The whole TOW data from the private data repo: import, then every round trip.
// Skipped where ../worldbuilder-data isn't checked out (the data is private and never in this repo).
import { describe, expect, it } from "vitest";
import type { Game, Item, Package } from "../src/items/items";
import { readFullYaml, writeFullYaml } from "../src/packages/full-yaml";
import * as formats from "../src/packages/formats";
import { exportPackage, exportSheets, importSheets } from "../src/packages/import-export";
import { foundNeeds } from "../src/packages/resolve";
import { planUpload, refreshLibrary } from "../src/library/library";
import { readCsv } from "../src/sheets/csv";
import { cellDifferences, loadFolder, saveFolder } from "./helpers";
import { hasTowData, readFolder, TOW_DATA } from "./read-folder";

describe.skipIf(!hasTowData)("TOW data from the data repo", () => {
  // Read only where the data is checked out: a skipped suite's body still runs when tests are collected.
  const files = hasTowData ? readFolder(TOW_DATA) : {};
  const first = loadFolder(files);
  const byKey = (items: Item[]) => new Map(items.map((i) => [i.key, i]));

  it("imports with no problems; the lores, specialisms and names in conditions or brackets become stubs", () => {
    expect(first.problems).toEqual([]);
    expect(new Set(first.stubbed.map((u) => u.name))).toEqual(
      new Set([
        "Battle Magic", "Daemonology", "Dark Magic", "Elementalism", "Illusion", "Necromancy", "The Witch", "The Revenant", "The Mutant", "The Daemon",
        // In brackets and conditions (owner, 23 Nov): Two Handed[-Strike Last], +2 [Only(Charging)] …
        "Strike Last", "Charging", "Riding", "Mounted", "Commanders of the Empire", "Imperial Wizard", "non-magical template",
        // The Dwarfs (photos, 28 Nov): rulebook rules and kit not entered yet.
        "Loner", "Multiple Shots", "Quick Shot",
        "Requires Two Hands", "Shieldwall", "Throwing Axes",
        // Part 2: war-machine weapons and rules not entered yet.
        "Ambushers", "Fire Thrower", "Move & Shoot", "Stone Thrower",
      ]),
    );
    const stubs = first.items.find((i) => i.key === "tow.the-empire.stubs") as Package;
    expect(stubs.stubsFor).toBe("tow.the-empire");
  });

  it("gives back every cell as typed", () => {
    expect(cellDifferences(files, saveFolder(first.items), readCsv)).toEqual([]);
  });

  it("round-trips through the folder, a zip, and sheet YAML", async () => {
    expect(loadFolder(saveFolder(first.items)).items).toEqual(first.items);
    const zipped = await formats.zipToFolder(formats.folderToZip(saveFolder(first.items), "tow"));
    expect(loadFolder(zipped).items).toEqual(first.items);
    const problems: formats.Problem[] = [];
    const sheets = formats.sheetYamlToSheets(formats.sheetsToSheetYaml(exportSheets(first.items)), "tow.yaml", problems)!;
    expect(problems).toEqual([]);
    expect(refreshLibrary(importSheets(sheets).items).items).toEqual(first.items);
  });

  it("round-trips each package through a workbook", async () => {
    const game = first.items.find((i): i is Game => i.kind === "game")!;
    for (const pkg of first.items.filter((i): i is Package => i.kind === "package" && !i.stubsFor)) {
      const problems: formats.Problem[] = [];
      const bytes = formats.packageToWorkbook(exportPackage(pkg, byKey(first.items)));
      const back = await formats.workbookToPackage(bytes, pkg.name, problems);
      const others = first.items.filter((i) => i.homePackage !== pkg.key && i.key !== pkg.key);
      const read = importSheets({ packages: [back] }, [game, ...others]);
      expect([...problems, ...read.problems]).toEqual([]);
      // Through the upload plan, as the app does: a name another book also has stays that book's own.
      const library = planUpload(first.items, read.items).library;
      for (const item of first.items) expect(byKey(library).get(item.key), item.key).toEqual(item);
    }
  });

  it("round-trips the whole game through one workbook", async () => {
    const { readXlsx } = await import("../src/sheets/xlsx");
    const tabs = await readXlsx(formats.gameToWorkbook(exportSheets(first.items)));
    const problems: formats.Problem[] = [];
    const sheets = formats.workbookTabsToGame(tabs, "tow.xlsx", problems);
    expect(problems).toEqual([]);
    expect(refreshLibrary(importSheets(sheets).items).items).toEqual(first.items);
  });

  it("writes full YAML and reads back the same items", () => {
    const back = readFullYaml(writeFullYaml(first.items));
    expect(back.problems).toEqual([]);
    expect(back.items).toEqual(first.items);
  });

  it("finds what The Empire needs from what its units name", () => {
    const empire = first.items.find((i) => i.key === "tow.the-empire") as Package;
    const needs = foundNeeds(empire, first.items);
    expect([...needs.keys()].sort()).toEqual(["tow.races", "tow.rulebook", "tow.the-empire.stubs"]);
    expect(needs.get("tow.rulebook")).toContain("Close Order");
    expect(empire.needsStated).toEqual(["tow.forces-of-fantasy"]);
  });

  it("finds what the Dwarfs need, and nothing of the Empire's", () => {
    const dwarfs = first.items.find((i) => i.key === "tow.dwarfen-mountain-holds") as Package;
    const needs = foundNeeds(dwarfs, first.items);
    expect([...needs.keys()].sort()).toEqual(["tow.dwarfen-mountain-holds.stubs", "tow.races", "tow.rulebook"]);
    expect(dwarfs.needsStated).toEqual(["tow.forces-of-fantasy"]);
  });
});
