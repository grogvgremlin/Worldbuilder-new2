// Profile lines worked out from the race cell, the unit it's based on, the line as entered and kit.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Item, Unit } from "../src/items/items";
import { workOutLines } from "../src/rules/lines";
import { loadFolder } from "./helpers";
import { hasTowData, readFolder, TOW_DATA } from "./read-folder";

const unit = (items: Item[], key: string) => items.find((i) => i.key === key) as Unit;

describe("worked-out lines (sample)", () => {
  const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));

  it("Empire Knights: the race cell, as entered, the Preceptor, and the horse with barding", () => {
    const lines = workOutLines(unit(items, "tow.unit.empire-knights"), items);
    expect(lines.map((l) => l.name)).toEqual(["Empire Knight", "Preceptor", "Barded Warhorse"]);
    expect(lines[0].line).toEqual({ M: 4, WS: 4, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 8 });
    expect(lines[0].differs).toEqual([]); // Human · Professional · Veteran is the printed line exactly
    expect(lines[1].line.A).toBe(2);
    expect(lines[2].line).toMatchObject({ M: 7, WS: 3, BS: "-", S: 3 });
    expect(lines[2].steps).toContain("Barding: M -1");
  });

  it("a detachment takes its parent's line", () => {
    const lines = workOutLines(unit(items, "tow.unit.state-missile-troops-detachment"), items);
    expect(lines[0].line).toMatchObject({ BS: 3, Ld: 7 });
  });
});

describe.skipIf(!hasTowData)("worked-out lines (private TOW data)", () => {
  const { items } = hasTowData ? loadFolder(readFolder(TOW_DATA)) : { items: [] as Item[] };
  it("Grand Master differs from Human · Professional · Lord by I +1, A +1", () => {
    expect(workOutLines(unit(items, "tow.unit.grand-master"), items)[0].differs).toEqual(["I +1", "A +1"]);
  });
  it("Chapter Master inherits the Grand Master's entry and has its own line", () => {
    expect(workOutLines(unit(items, "tow.unit.chapter-master"), items)[0].line).toMatchObject({ M: 4, WS: 5, Ld: 8 });
  });
  it("the War Altar's steeds are Horse with barding", () => {
    const steed = workOutLines(unit(items, "tow.unit.war-altar-of-sigmar"), items).find((l) => l.name === "Barded Warhorse")!;
    expect(steed.line.M).toBe(7);
  });
});
