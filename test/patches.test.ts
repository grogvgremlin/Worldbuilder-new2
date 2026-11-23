// Patches: named changes in the entry columns, applied in sequence in the roster (owner, 23 Nov).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { CompositionRule, Context, Game, Item, Package, Patch, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, inReach, newRoster, viewRoster } from "../src/lists/roster";
import { patchesInPlay } from "../src/rules/patches";
import { foundNeeds } from "../src/packages/resolve";
import { writeCsv, readCsv } from "../src/sheets/csv";
import { PATCH_COLUMNS } from "../src/packages/patch-tabs";
import { loadFolder, saveFolder } from "./helpers";
import { readFolder } from "./read-folder";

const unitPatches: Record<string, string>[] = [
  { Patch: "Cheaper knights", Unit: "Empire Knights", Cost: "-1~pi", Reference: "House rules;1" },
  { Patch: "Free lances", Unit: "Empire Knights", "Equipment Options": "Lances(add;0~pi)" },
  { Patch: "Inner Circle", Unit: "Empire Knights", "Link Key": "C", Name: "Inner Circle Preceptor", Cost: "+2", A: "+1" },
  { Patch: "Inner Circle", Unit: "Empire Knights", Rules: "add:Fear" },
  { Patch: "Drilled state troops", Unit: "State Missile Troops", Cost: "+1~pi" },
];
const compositionPatches = [{ Patch: "Core a third", Composition: "Core", "Unit Limit": "points~33%-~roster target" }];

function library(extraUnitRows: Record<string, string>[] = []) {
  const files = readFolder(join(__dirname, "fixtures/tow-sample"));
  files["house-rules/package.yaml"] = "package: House rules\ngame: tow\nlayer: house\n";
  files["house-rules/unit-patches.csv"] = writeCsv({ columns: PATCH_COLUMNS.unit, rows: [...unitPatches, ...extraUnitRows] });
  files["house-rules/composition-patches.csv"] = writeCsv({ columns: PATCH_COLUMNS["composition-rule"], rows: compositionPatches });
  return loadFolder(files);
}

function setUp(items: Item[], off: string[] = []) {
  const tow = items.find((i): i is Game => i.kind === "game")!;
  let context = switchOn(newContext("Friday", tow, items), "tow.the-empire", items);
  context = switchOn(context, "tow.house-rules", [...items, context]);
  context = { ...context, off };
  const all = [...items, context];
  return { all, context, empire: armyListsIn(context, all)[0] };
}

function rosterWith(all: Item[], context: Context, unitKey: string, size?: number): Roster {
  const r = newRoster("Test", context, armyListsIn(context, all)[0], 1000, all);
  const withUnit = addUnit(r, all.find((i): i is Unit => i.key === unitKey)!, all);
  return size ? { ...withUnit, units: withUnit.units.map((u) => ({ ...u, size })) } : withUnit;
}

describe("patches from a sheet", () => {
  const { items, problems } = library();

  it("reads rows sharing a name as one patch, in the package's order", () => {
    expect(problems).toEqual([]);
    const pkg = items.find((i): i is Package => i.key === "tow.house-rules")!;
    const patches = pkg.members.map((k) => items.find((i) => i.key === k) as Patch);
    expect(patches.map((p) => p.name)).toEqual(["Cheaper knights", "Free lances", "Inner Circle", "Drilled state troops", "Core a third"]);
    const inner = patches[2];
    expect(inner.changes).toHaveLength(2);
    expect(inner.changes[0]).toMatchObject({ row: "C", unit: { name: "Inner Circle Preceptor", cost: { points: 2, adds: true }, stats: { A: { change: 1 } } } });
    expect(patches[0].changes[0].unit!.cost).toEqual({ points: -1, per: "model", adds: true });
    expect(patches[0].reference).toEqual({ source: "House rules", page: "1" });
  });

  it("finds that house rules need the Empire (what the patches change)", () => {
    const pkg = items.find((i): i is Package => i.key === "tow.house-rules")!;
    expect([...foundNeeds(pkg, items).keys()]).toContain("tow.the-empire");
  });

  it("writes the same cells back", () => {
    const out = saveFolder(items);
    const rows = readCsv(out["house-rules/unit-patches.csv"]).rows;
    expect(rows.map((r) => [r.Patch, r.Unit, r["Link Key"], r.Cost, r["Equipment Options"], r.Rules])).toEqual([
      ["Cheaper knights", "Empire Knights", "", "-1~pi", "", ""],
      ["Free lances", "Empire Knights", "", "", "Lances(add;0~pi)", ""],
      ["Inner Circle", "Empire Knights", "C", "+2", "", ""],
      ["Inner Circle", "Empire Knights", "", "", "", "add:Fear"],
      ["Drilled state troops", "State Missile Troops", "", "+1~pi", "", ""],
    ]);
    expect(readCsv(out["house-rules/composition-patches.csv"]).rows[0]["Unit Limit"]).toBe("points~33%-~roster target");
  });
});

describe("patches in a roster", () => {
  const { items } = library();
  const { all, context } = setUp(items);

  it("changes a cost by a delta, and a command row's name, cost and stats", () => {
    const r = rosterWith(all, context, "tow.unit.empire-knights", 5);
    const u = viewRoster(r, all).units[0];
    expect(u.breakdown[0]).toBe("5 × 20 = 100");
    expect(u.taken!.slotRows.find((s) => s.slotCode === "C")).toMatchObject({ name: "Inner Circle Preceptor", cost: { points: 8 }, stats: { A: { change: 2 } } });
    expect(u.choices[0].choices.map((c) => c.label)).toContain("Inner Circle Preceptor");
    expect(u.taken!.rules.map((t) => t.name)).toContain("Fear");
  });

  it("makes an option free where it stands, keeping its choose-one", () => {
    const r = rosterWith(all, context, "tow.unit.empire-knights");
    const group = viewRoster(r, all).units[0].choices.find((g) => g.choices.some((c) => c.label === "Lances"))!;
    expect(group.oneOf).toBe(true);
    expect(group.required).toBe(true);
    expect(group.choices.find((c) => c.label === "Lances")!.costText).toBe("free");
  });

  it("lists each step it applied, in order", () => {
    const r = rosterWith(all, context, "tow.unit.empire-knights");
    expect(viewRoster(r, all).units[0].taken!.patched).toEqual([
      "Cheaper knights: Empire Knights: Cost -1~pi",
      "Free lances: Empire Knights: Equipment Options Lances(add;0~pi)",
      "Inner Circle: Empire Knights (C): Name Inner Circle Preceptor; A +1; Cost +2",
      "Inner Circle: Empire Knights: Rules add:Fear",
    ]);
  });

  it("reaches a unit based on the patched one (the detachment costs 8)", () => {
    const r = rosterWith(all, context, "tow.unit.state-missile-troops-detachment", 5);
    expect(viewRoster(r, all).units[0].breakdown[0]).toBe("5 × 8 = 40");
  });

  it("changes a composition rule (Core at least 33%)", () => {
    const core = inReach(context, all).find((i): i is CompositionRule => i.kind === "composition-rule" && i.name === "Core")!;
    expect(core.limits.limits[0].amount.min).toBe(33);
    const r = rosterWith(all, context, "tow.unit.empire-knights");
    expect(viewRoster(r, all).issues.map((i) => i.message)).toContain("Core: 80 pts, at least 33%");
  });
});

describe("switching patches off", () => {
  it("one card switched off in the set-up, its package still on", () => {
    const { items } = library();
    const { all, context } = setUp(items, ["tow.patch.cheaper-knights"]);
    const r = rosterWith(all, context, "tow.unit.empire-knights", 5);
    expect(viewRoster(r, all).units[0].breakdown[0]).toBe("5 × 21 = 105");
    expect(patchesInPlay(context, all).skipped.map((s) => [s.patch.name, s.why])).toEqual([["Cheaper knights", "switched off here"]]);
  });

  it("a later patch switches an earlier one off: no +1 then +2, just the later", () => {
    const { items } = library([{ Patch: "Dearer knights", "Switches off": "Cheaper knights", Unit: "Empire Knights", Cost: "+2~pi" }]);
    const { all, context } = setUp(items);
    const r = rosterWith(all, context, "tow.unit.empire-knights", 5);
    expect(viewRoster(r, all).units[0].breakdown[0]).toBe("5 × 23 = 115");
    expect(patchesInPlay(context, all).skipped.map((s) => s.why)).toEqual(["switched off by Dearer knights"]);
  });

  it("a later plain value wins over an earlier change", () => {
    const { items } = library([{ Patch: "Knights at 25", Unit: "Empire Knights", Cost: "25~pi" }]);
    const { all, context } = setUp(items);
    const r = rosterWith(all, context, "tow.unit.empire-knights", 5);
    expect(viewRoster(r, all).units[0].breakdown[0]).toBe("5 × 25 = 125");
  });

  it("says when a patch names something that isn't there", () => {
    const { items } = library([{ Patch: "Ghosts", Unit: "Ghost Knights", Cost: "1~pi" }]);
    const { all, context } = setUp(items);
    expect(patchesInPlay(context, all).problems).toEqual(["Ghosts: nothing called “Ghost Knights” to change"]);
  });
});

