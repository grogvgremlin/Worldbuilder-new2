// The Library journey, through the same AppData the screens call: upload a game into an empty
// library, review the draft, add it, find it again after the app is reopened; download a package
// as a workbook and upload it back.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { AppData } from "../src/app/app-data";
import { IndexedDbStore, MemoryStore } from "../src/store/store";
import { folderToZip } from "../src/packages/formats";
import { downloadGameSheetYaml, downloadPackageWorkbook } from "../src/library/upload";
import type { Game, Package } from "../src/items/items";
import { readFolder } from "./read-folder";

const zip = folderToZip(readFolder(join(__dirname, "fixtures/tow-sample")), "tow");

describe("Library journey", () => {
  for (const [label, open] of [
    ["in memory", async () => new MemoryStore()],
    ["IndexedDB", async () => IndexedDbStore.open("journey-" + Math.random())],
  ] as const) {
    it(`uploads a game, reviews it, adds it, and keeps it (${label})`, async () => {
      const store = await open();
      const app = new AppData(store);
      await app.load();
      expect(app.items).toEqual([]);

      const draft = await app.readDraft([{ name: "tow.zip", bytes: zip }]);
      expect(draft.problems).toEqual([]);
      expect(draft.plan.added.length).toBeGreaterThan(20);
      expect(draft.plan.changed).toEqual([]);
      expect(app.items).toEqual([]); // nothing lands before it's accepted

      await app.accept(draft);
      const reopened = new AppData(store);
      await reopened.load();
      expect(reopened.items.map((i) => i.key).sort()).toEqual(app.items.map((i) => i.key).sort());

      // The same upload again changes nothing.
      const again = await reopened.readDraft([{ name: "tow.zip", bytes: zip }]);
      expect(again.plan.added).toEqual([]);
      expect(again.plan.changed).toEqual([]);
    });
  }

  it("downloads a package as a workbook and the game as YAML, and both upload back unchanged", async () => {
    const app = new AppData(new MemoryStore());
    await app.accept(await app.readDraft([{ name: "tow.zip", bytes: zip }]));
    const empire = app.items.find((i) => i.key === "tow.the-empire") as Package;
    const workbook = downloadPackageWorkbook(app.items, empire);
    expect(workbook.fileName).toBe("the-empire-of-man.xlsx");
    const back = await app.readDraft([{ name: workbook.fileName, bytes: workbook.bytes }]);
    expect(back.problems).toEqual([]);
    expect(back.plan.changed).toEqual([]);
    expect(back.plan.removed).toEqual([]);

    const game = app.items.find((i): i is Game => i.kind === "game")!;
    const yaml = downloadGameSheetYaml(app.items, game);
    const fromYaml = await app.readDraft([{ name: yaml.fileName, bytes: yaml.bytes }]);
    expect(fromYaml.problems).toEqual([]);
    expect(fromYaml.plan.changed).toEqual([]);
  });
});
