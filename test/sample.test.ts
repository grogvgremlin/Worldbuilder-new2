// A handful of TOW Empire units (the public sample in test/fixtures/tow-sample): import, the stored
// form, both round trips, and the dependencies found.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { exportGameFolder, importGameFolder } from "../src/packages/game-folder";
import { readFullYaml, writeFullYaml } from "../src/packages/full-yaml";
import { foundNeeds } from "../src/packages/resolve";
import { readCsv } from "../src/sheets/csv";
import type { ArmyList, Package, Unit } from "../src/items/items";
import { readFolder } from "./read-folder";

const files = readFolder(join(__dirname, "fixtures/tow-sample"));
const result = importGameFolder(files);
const item = (key: string) => result.items.find((i) => i.key === key);

describe("the TOW sample", () => {
  it("imports with no problems and every name matched", () => {
    expect(result.problems).toEqual([]);
    expect(result.unmatched).toEqual([]);
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

  // The one change allowed: a space before a bracket in an options cell is dropped.
  it("gives back every cell as typed", () => {
    const out = exportGameFolder(result.items);
    for (const [path, text] of Object.entries(files)) {
      if (!path.endsWith(".csv")) continue;
      const tidy = (rows: Record<string, string>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "Key").map(([k, v]) => [k, k.endsWith("Options") ? v.trim().replace(/ \(/g, "(") : v.trim()])));
      expect(tidy(readCsv(out[path]).rows), path).toEqual(tidy(readCsv(text).rows));
    }
  });

  it("round-trips through sheets and through full YAML", () => {
    expect(importGameFolder(exportGameFolder(result.items)).items).toEqual(result.items);
    const back = readFullYaml(writeFullYaml(result.items));
    expect(back.problems).toEqual([]);
    expect(back.items).toEqual(result.items);
  });

  it("reports a bad file instead of stopping", () => {
    const broken = { ...files, "game.yaml": "game: Warhammer: the Old World\n" };
    const r = importGameFolder(broken);
    expect(r.items).toEqual([]);
    expect(r.problems[0].message).toMatch(/colon needs quotes/);
  });
});
