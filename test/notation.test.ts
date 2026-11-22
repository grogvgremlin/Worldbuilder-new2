// Each kind of cell: read into the stored form, and written back the same.
import { describe, expect, it } from "vitest";
import { readOptions, writeOptions } from "../src/notation/options";
import { readLimits, readSlots, writeLimits, writeSlots } from "../src/notation/slots-and-limits";
import { readTerms, writeTerms } from "../src/notation/terms";
import { readCost, readRange, readStat, writeCost, writeRange, writeStat } from "../src/notation/values";

const both = <T>(read: (t: string, p: string[]) => T, write: (v: T) => string) => (cell: string) => {
  const problems: string[] = [];
  const value = read(cell, problems);
  expect(problems).toEqual([]);
  expect(write(value)).toBe(cell);
  return value;
};

describe("cells", () => {
  it("costs", () => {
    const cost = both(readCost, writeCost);
    expect(cost("5~pi")).toEqual({ points: 5, per: "model", adds: false });
    expect(cost("+16")).toEqual({ points: 16, per: "unit", adds: true });
    cost("90");
  });

  it("sizes", () => {
    const range = both(readRange, writeRange);
    expect(range("10-")).toEqual({ min: 10, max: null });
    expect(range("-10")).toEqual({ min: null, max: 10 });
    range("0-1");
    range("1");
    range("2-12");
  });

  it("stats", () => {
    const stat = both((t) => readStat(t), writeStat);
    expect(stat("4")).toBe(4);
    expect(stat("+1")).toEqual({ change: 1 });
    expect(stat("-")).toEqual({ none: true });
    expect(stat("(+3)")).toEqual({ riderChange: 3 });
    expect(stat("4+")).toEqual({ target: 4 });
    expect(stat("+2 [Only(Charging)]")).toEqual({ change: 2, when: [{ name: "Only", detail: "Charging" }] });
  });

  it("named references", () => {
    const terms = both((t, p) => readTerms(t, p), (v) => writeTerms(v));
    expect(terms("Hand Weapon;Barded Warhorse(Ridden)~Mount")).toEqual([
      { name: "Hand Weapon" },
      { name: "Barded Warhorse", detail: "Ridden", as: "Mount" },
    ]);
    expect(terms("Two Handed[-Strike Last]")).toEqual([{ name: "Two Handed", linked: [{ name: "Strike Last", change: "remove" }] }]);
    const rules = both((t, p) => readTerms(t, p), (v) => writeTerms(v, "rules"));
    expect(rules("add:Veteran")).toEqual([{ name: "Veteran", change: "add" }]);
    rules("replace~Wizard(3);Wizard(1)");
  });

  it("options", () => {
    const options = both(readOptions, writeOptions);
    const knights = options("[Great Weapons(add;+1~pi) OR Lances(add;+1~pi) OR Great Weapons(replace~Shield;0~pi);Mandatory]")!;
    expect(knights.groups[0].required).toBe(true);
    expect(knights.groups[0].options[2]).toEqual({
      name: "Great Weapons",
      action: "replace",
      replaces: [{ name: "Shield" }],
      cost: { points: 0, per: "model", adds: false },
    });
    const mount = options("Barded Warhorse~Mount(add;+16)[Troop Type(Heavy Cavalry);Counter Charge]")!;
    expect(mount.groups[0].options[0]).toMatchObject({ name: "Barded Warhorse", as: "Mount", grants: [{ name: "Troop Type", detail: "Heavy Cavalry" }, { name: "Counter Charge" }] });
    expect(options("-War Altar of Sigmar~Mount;Magic Items(;0-50 total)")!.removeInherited).toEqual([{ name: "War Altar of Sigmar", as: "Mount", change: "remove" }]);
    expect(options("Wizard(4)(replace~Wizard(3);30)")!.groups[0].options[0]).toMatchObject({ name: "Wizard", detail: "4", replaces: [{ name: "Wizard", detail: "3" }] });
  });

  it("slots and limits", () => {
    const slots = both(readSlots, writeSlots);
    expect(slots("C(slots);SB(0-1;upgrade;+5)")!.slots).toEqual([
      { code: "C", fromUnitRows: true },
      { code: "SB", count: { min: 0, max: 1 }, type: "upgrade", cost: { points: 5, per: "unit", adds: true } },
    ]);
    const limits = both(readLimits, writeLimits);
    expect(limits("unit(Great Cannon,Mortar)~0-3~1000 roster target")!.limits[0]).toEqual({
      counts: "unit", of: ["Great Cannon", "Mortar"], amount: { min: 0, max: 3 }, percent: false, perPoints: 1000, basis: "roster target",
    });
    expect(limits("points~-50%~roster target")!.limits[0]).toMatchObject({ amount: { min: null, max: 50 }, percent: true });
    limits("units[not Character; Troop Type not Swarm,War Beasts,War Machine]~3-~army");
  });
});
