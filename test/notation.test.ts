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

describe("card words", async () => {
  const { optionBlocks, slotText, limitAmountText } = await import("../src/app/words");
  const { readOptions } = await import("../src/notation/options");
  it("lays out a choice one option per line, and single options as one list", () => {
    const knights = readOptions("[Great Weapons(add;+1~pi) OR Lances(add;+1~pi);Mandatory];Drilled(1~pi);Stubborn(2~pi)", [])!;
    expect(optionBlocks(knights)).toEqual([
      { heading: "Choose one (required):", choices: ["Great Weapons (+1 pts per model) or", "Lances (+1 pts per model)"] },
      { heading: null, choices: ["Drilled (1 pts per model)", "Stubborn (2 pts per model)"] },
    ]);
  });
  it("names a command slot by its own row, with its cost", () => {
    expect(slotText({ code: "C", fromUnitRows: true }, { name: "Preceptor", cost: { points: 6, per: "unit", adds: true } }, new Map([["C", "Champion"]]))).toBe("Preceptor +6 pts");
    expect(slotText({ code: "M", count: { min: 0, max: 1 }, type: "upgrade", cost: { points: 6, per: "unit", adds: true } }, undefined, new Map([["M", "Musician"]]))).toBe("Musician +6 pts");
  });
  it("words a limit", () => {
    expect(limitAmountText({ counts: "rules options", amount: { min: 0, max: 1 }, percent: false, perPoints: 1000, basis: "roster target" })).toBe("0–1 per 1,000 pts of the roster target");
  });
});

describe("slot sections (owner, 24 Nov)", () => {
  it("Command(...);Other(...) groups slots under headings, and writes back the same", async () => {
    const { readSlots, writeSlots } = await import("../src/notation/slots-and-limits");
    const text = "Command(C(slots);SB(slots);M(0-1;upgrade;+6));Other(Crew(slots))";
    const cell = readSlots(text, [])!;
    expect(cell.slots.map((s) => [s.code, s.section])).toEqual([["C", "Command"], ["SB", "Command"], ["M", "Command"], ["Crew", "Other"]]);
    expect(cell.slots[2]).toMatchObject({ count: { min: 0, max: 1 }, type: "upgrade" });
    expect(writeSlots(cell)).toBe(text);
    expect(writeSlots(readSlots("C(slots);SB(slots)", [])!)).toBe("C(slots);SB(slots)");
  });
});
