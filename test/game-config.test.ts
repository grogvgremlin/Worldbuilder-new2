// A game's configuration edited in the app: presets from a set-up, edits, and the round trip.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Game } from "../src/items/items";
import { fromPreset, switchOn } from "../src/context/context";
import { movePreset, presetFromContext, withPreset, withSetting } from "../src/context/game-config";
import { exportSheets, importSheets } from "../src/packages/import-export";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const tow = items.find((i): i is Game => i.kind === "game")!;

describe("game configuration in the app", () => {
  it("saves a set-up as a preset, by name, and starting from it gives the same set-up", () => {
    let ctx = fromPreset("x", tow, null, items).context;
    ctx = switchOn(ctx, "tow.the-empire", items);
    ctx = { ...ctx, settings: { "Per 1,000 points": "started(target / 1000)" } };
    const preset = presetFromContext(ctx, items, "Empire, started thousands");
    expect(preset).toEqual({ name: "Empire, started thousands", books: ["The Empire of Man"], composition: ["Standard composition"], settings: { "Per 1,000 points": "started(target / 1000)" } });
    const again = fromPreset("y", tow, preset, items).context;
    expect(again.books).toEqual(ctx.books);
    expect(again.settings).toEqual(ctx.settings);
  });

  it("adds, edits, moves and removes presets and settings", () => {
    let g = withPreset(tow, tow.presets!.length, { name: "Mine" });
    expect(g.presets!.map((p) => p.name)).toEqual(["TOW core only", "TOW basic", "Mine"]);
    g = movePreset(g, 2, -1);
    expect(g.presets!.map((p) => p.name)).toEqual(["TOW core only", "Mine", "TOW basic"]);
    g = withPreset(g, 0, null);
    expect(g.presets!.map((p) => p.name)).toEqual(["Mine", "TOW basic"]);
    g = withSetting(g, 0, { ...g.settings![0], default: "started(target / 1000)" });
    expect(g.settings![0].default).toBe("started(target / 1000)");
  });

  it("what's edited in the app downloads with the game and reads back the same", () => {
    const edited = withPreset(tow, tow.presets!.length, { name: "Mine", books: ["Forces of Fantasy"], armies: "all" });
    const lib = items.map((i) => (i.key === tow.key ? edited : i));
    const back = importSheets(exportSheets(lib)).items.find((i): i is Game => i.kind === "game")!;
    expect(back.presets).toEqual(edited.presets);
    expect(back.settings).toEqual(edited.settings);
  });
});
