// A handful of TOW Empire units (the public sample in test/fixtures/tow-sample): import, the stored
// form, both round trips, and the dependencies found.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadFolder, saveFolder, cellDifferences } from "./helpers";
import { importFolder } from "../src/library/upload";
import { planUpload } from "../src/library/library";
import { readFullYaml, writeFullYaml } from "../src/packages/full-yaml";
import { foundNeeds } from "../src/packages/resolve";
import { readCsv } from "../src/sheets/csv";
import type { ArmyList, Item, Package, Unit } from "../src/items/items";
import { readFolder } from "./read-folder";

const files = readFolder(join(__dirname, "fixtures/tow-sample"));
const result = loadFolder(files);
const item = (key: string) => result.items.find((i: Item) => i.key === key);

describe("the TOW sample", () => {
  it("imports with no problems and every name matched", () => {
    expect(result.problems).toEqual([]);
    expect(result.stubbed).toEqual([]);
  });

  it("stores a unit in plain words", () => {
    const smt = item("tow.unit.state-missile-troops") as Unit;
    const own = smt.rows[0];
    expect(own.name).toBe("State Missile Trooper");
    expect(own.stats).toEqual({ M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 });
    expect(own.cost).toEqual({ points: 7, per: "model", adds: false });
    expect(own.size).toEqual({ min: 10, max: null });
    expect(own.equipment.map((e) => e.item)).toEqual(["tow.equipment.hand-weapon", "tow.equipment.crossbow"]);
    expect(own.equipmentOptions?.groups[0].options[0]).toEqual({
      name: "Handguns",
      item: "tow.equipment.handgun",
      action: "replace",
      replaces: [{ name: "Crossbow", item: "tow.equipment.crossbow" }],
      cost: { points: 1, per: "model", adds: true },
    });
    expect(smt.rows[1]).toMatchObject({ type: "Slots-Upgrade", slotCode: "C", name: "Sergeant", stats: { BS: { change: 1 } } });
  });

  it("puts a unit's category on the army list's entry, and marks mounts", () => {
    const list = item("tow.army-list.the-empire-of-man") as ArmyList;
    expect(list.entries).toContainEqual({ unit: "tow.unit.state-missile-troops", category: "Core" });
    expect((item("tow.unit.barded-warhorse") as Unit).class).toBe("mount");
  });

  it("matches a plural to its item and keeps the name as written", () => {
    const knights = item("tow.unit.empire-knights") as Unit;
    const first = knights.rows[0].equipmentOptions!.groups[0].options[0];
    expect(first).toMatchObject({ name: "Great Weapons", item: "tow.equipment.great-weapon" });
  });

  it("finds what The Empire needs, and keeps what's stated", () => {
    const empire = item("tow.the-empire") as Package;
    const needs = foundNeeds(empire, result.items);
    expect([...needs.keys()]).toEqual(["tow.rulebook"]);
    expect(needs.get("tow.rulebook")).toEqual(expect.arrayContaining(["Close Order", "Hand Weapon", "Crossbow"]));
    expect(empire.needsStated).toEqual(["tow.forces-of-fantasy"]);
    expect(empire.partOf).toBe("tow.forces-of-fantasy");
  });

  it("gives back every cell as typed", () => {
    expect(cellDifferences(files, saveFolder(result.items), readCsv)).toEqual([]);
  });

  it("round-trips through sheets and through full YAML", () => {
    expect(loadFolder(saveFolder(result.items)).items).toEqual(result.items);
    const back = readFullYaml(writeFullYaml(result.items));
    expect(back.problems).toEqual([]);
    expect(back.items).toEqual(result.items);
  });

  it("reports a bad file instead of stopping", () => {
    const r = loadFolder({ ...files, "game.yaml": "game: Warhammer: the Old World\n" });
    expect(r.problems[0].message).toMatch(/colon needs quotes/);
  });

  it("makes a stub for a name that matches nothing, and drops it when the real item arrives", () => {
    const withoutCrossbow = { ...files };
    withoutCrossbow["rulebook/equipment.csv"] = files["rulebook/equipment.csv"].split("\r\n").filter((l) => !l.startsWith("Crossbow,")).join("\r\n");
    const r = loadFolder(withoutCrossbow);
    expect(r.stubbed.map((u) => u.name)).toContain("Crossbow");
    const stub = r.items.find((i: Item) => i.key === "tow.equipment.crossbow")!;
    expect(stub).toMatchObject({ status: "stub", homePackage: "tow.the-empire.stubs" });
    // Upload the rulebook again, Crossbow and all.
    const rulebook = Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith("rulebook/") || p === "game.yaml"));
    const again = importFolder(rulebook, r.items);
    const plan = planUpload(r.items, again.items.filter((i) => i.homePackage === "tow.rulebook" || i.key === "tow.rulebook"));
    expect(plan.changed.map((i) => i.key)).toContain("tow.equipment.crossbow"); // it was a stub
    expect(plan.removed).toEqual([]);
    const fix = { items: plan.library };
    expect(fix.items.find((i: Item) => i.key === "tow.equipment.crossbow")).toMatchObject({ homePackage: "tow.rulebook" });
    expect(fix.items.find((i: Item) => i.key === "tow.the-empire.stubs")).toBeUndefined();
  });
});

describe("moving an item to another book", () => {
  it("changes its home and package lists, keeps its key, and everything still finds it", async () => {
    const { moveItem } = await import("../src/library/library");
    const { items } = loadFolder(files);
    const moved = moveItem(items, "tow.equipment.hochland-long-rifle", "tow.rulebook");
    const rifle = moved.find((i) => i.key === "tow.equipment.hochland-long-rifle")!;
    expect(rifle.homePackage).toBe("tow.rulebook");
    expect((moved.find((i) => i.key === "tow.rulebook") as Package).members).toContain(rifle.key);
    expect((moved.find((i) => i.key === "tow.the-empire") as Package).members).not.toContain(rifle.key);
    const smt = moved.find((i) => i.key === "tow.unit.state-missile-troops") as Unit;
    expect(JSON.stringify(smt)).toContain('"item":"tow.equipment.hochland-long-rifle"');
    // and it downloads into the rulebook's folder now
    expect(saveFolder(moved)["rulebook/equipment.csv"]).toContain("Hochland Long Rifle");
  });
});
