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
      expect(app.items.map((i) => i.key)).toEqual(["pickup"]); // only the permanent Pick-up sandbox

      const draft = await app.readDraft([{ name: "tow.zip", bytes: zip }]);
      expect(draft.problems).toEqual([]);
      expect(draft.plan.added.length).toBeGreaterThan(20);
      expect(draft.plan.changed).toEqual([]);
      expect(app.items.map((i) => i.key)).toEqual(["pickup"]); // nothing lands before it's accepted

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

describe("whole-game workbook", () => {
  it("downloads the game as one workbook and uploads it back unchanged", async () => {
    const { downloadGameWorkbook } = await import("../src/library/upload");
    const app = new AppData(new MemoryStore());
    await app.accept(await app.readDraft([{ name: "tow.zip", bytes: zip }]));
    const game = app.items.find((i): i is Game => i.kind === "game")!;
    const book = downloadGameWorkbook(app.items, game);
    const fresh = new AppData(new MemoryStore());
    const draft = await fresh.readDraft([{ name: book.fileName, bytes: book.bytes }]);
    expect(draft.problems).toEqual([]);
    expect(draft.plan.library).toEqual(app.items);
  });
});

describe("Friday pick-up game journey", () => {
  it("starts a game, switches on the Empire, builds a list, and finds it all after reopening", async () => {
    const { newContext, switchOn } = await import("../src/context/context");
    const { addUnit, armyListsIn, newRoster, viewRoster } = await import("../src/lists/roster");
    const store = new MemoryStore();
    const app = new AppData(store);
    await app.accept(await app.readDraft([{ name: "tow.zip", bytes: zip }]));
    const tow = app.items.find((i): i is Game => i.kind === "game")!;
    const friday = switchOn(newContext("Friday night", tow, app.items), "tow.the-empire", app.items);
    await app.putItem(friday);
    const empire = armyListsIn(friday, app.items)[0];
    let roster = newRoster("Empire 1,000", friday, empire, 1000, app.items);
    roster = addUnit(roster, app.items.find((i) => i.key === "tow.unit.state-missile-troops") as never, app.items);
    await app.putItem(roster);

    const reopened = new AppData(store);
    await reopened.load();
    const back = reopened.items.find((i) => i.key === roster.key)!;
    expect(viewRoster(back as never, reopened.items).total).toBe(70);

    // A new upload of the library leaves pick-up games and lists alone.
    const again = await reopened.readDraft([{ name: "tow.zip", bytes: zip }]);
    await reopened.accept(again);
    expect(reopened.items.find((i) => i.key === roster.key)).toBeDefined();
    expect(reopened.items.find((i) => i.key === friday.key)).toBeDefined();
  });
});
