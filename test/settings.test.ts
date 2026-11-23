// Settings: declared by the game, set by packages, a pick-up game or a list; the scaling shorthand.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Game, Item, Package, Roster, SettingValue, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, toggleChoice, viewRoster } from "../src/lists/roster";
import { applyScaling, evaluate, settingValue } from "../src/settings/settings";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

describe("the scaling shorthand", () => {
  const r = { min: 0, max: 1 };
  it("full, started and nearest thousands", () => {
    expect(applyScaling("full(target / 1000)", 2500, r)).toEqual({ min: 0, max: 2 });
    expect(applyScaling("started(target / 1000)", 2100, r)).toEqual({ min: 0, max: 3 });
    expect(applyScaling("nearest(target / 1000)", 2500, r)).toEqual({ min: 0, max: 3 });
    expect(applyScaling("full(target / 1000)", 500, r)).toEqual({ min: 0, max: 0 });
  });
  it("in proportion: 0–3 per 2,000 at 1,500", () => {
    expect(applyScaling("scale(target / 2000, down)", 1500, { min: 0, max: 3 })).toEqual({ min: 0, max: 2 });
    expect(applyScaling("scale(target / 2000, up)", 1500, { min: 0, max: 3 })).toEqual({ min: 0, max: 3 });
  });
  it("reads plain arithmetic, and says when it can't", () => {
    expect(evaluate("(target + 500) / 1000", 1500)).toBe(2);
    expect(applyScaling("half(target)", 1000, r)).toEqual({ error: "can't read “half(target)” (e.g. full(target / 1000))" });
  });
});

describe("where a setting's value comes from", () => {
  const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
  const tow = items.find((i): i is Game => i.kind === "game")!;
  const house: Package = { key: "tow.my-house", kind: "package", name: "My house rules", game: "tow", layer: "house", members: ["tow.setting.my-house.per-1-000-points"], includes: [], needsStated: [] };
  const started: SettingValue = { key: "tow.setting.my-house.per-1-000-points", kind: "setting", name: "Per 1,000 points", setting: "Per 1,000 points", value: "started(target / 1000)", homePackage: "tow.my-house" };
  const all: Item[] = [...items, house, started];
  const name = "Per 1,000 points";

  it("the game declares it, with a default and the dropdown's choices", () => {
    expect(tow.settings![0]).toMatchObject({ name, default: "full(target / 1000)" });
    expect(Object.keys(tow.settings![0].choices)).toContain("Started thousands (2,100 → 3)");
    expect(settingValue(name, tow, all, newContext("x", tow, all))).toEqual({ value: "full(target / 1000)", from: "the game's default" });
  });

  it("a house-rules package switched on sets the game's default; the game, then the list, override it", () => {
    let ctx = switchOn(newContext("x", tow, all), "tow.my-house", all);
    expect(settingValue(name, tow, all, ctx)).toEqual({ value: "started(target / 1000)", from: "My house rules" });
    ctx = { ...ctx, settings: { [name]: "nearest(target / 1000)" } };
    expect(settingValue(name, tow, all, ctx)?.from).toBe("this set-up");
    const roster = { settings: { [name]: "full(target / 1000)" } } as unknown as Roster;
    expect(settingValue(name, tow, all, ctx, roster)).toEqual({ value: "full(target / 1000)", from: "this list" });
  });

  it("the roster's limits follow it: two Drilled Knights at 2,100 points", () => {
    let ctx = switchOn(newContext("x", tow, all), "tow.the-empire", all);
    const lists = armyListsIn(ctx, [...all, ctx]);
    const knights = all.find((i): i is Unit => i.key === "tow.unit.empire-knights")!;
    let r = newRoster("x", ctx, lists[0], 2100, [...all, ctx]);
    r = addUnit(addUnit(r, knights, all), knights, all);
    for (const id of ["u1", "u2"]) {
      const g = viewRoster(r, [...all, ctx]).units.find((u) => u.rosterUnit.id === id)!.choices.find((c) => c.where === "rules options")!;
      r = toggleChoice(r, id, g, g.choices[0]);
    }
    const messages = () => viewRoster(r, [...all, ctx]).issues.map((i) => i.message);
    expect(messages()).not.toContain("Empire Knights with a special rule option: 2 taken, at most 1 at 2,100 pts (0–1 per 1,000 pts)"); // full: 2 allowed
    r = { ...r, settings: { [name]: "full(target / 2000)" } };
    expect(messages()).toContain("Empire Knights with a special rule option: 2 taken, at most 1 at 2,100 pts (0–1 per 1,000 pts)");
  });
});
