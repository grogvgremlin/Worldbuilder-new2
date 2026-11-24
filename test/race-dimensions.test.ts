// Race dimensions: configurable on the game; a 4th one is just another column (owner, 23 Nov).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Game, RaceProfile } from "../src/items/items";
import { readCsv, writeCsv } from "../src/sheets/csv";
import { loadFolder, saveFolder } from "./helpers";
import { readFolder } from "./read-folder";

const files = readFolder(join(__dirname, "fixtures/tow-sample"));

describe("race dimensions", () => {
  it("default: Race, Tree (blank Core), Rank (blank Base); keys as before", () => {
    const { items } = loadFolder(files);
    const human = items.find((i): i is RaceProfile => i.key === "tow.race.human.core.base")!;
    expect(human.profile).toEqual({ Race: "Human", Tree: "Core", Rank: "Base" });
    expect(human.name).toBe("Human · Core · Base");
  });

  it("a 4th dimension declared on the game is read, keyed and written back", () => {
    const withAge = { ...files };
    withAge["game.yaml"] += "\nrace dimensions:\n  - { name: Race }\n  - { name: Tree, blank: Core }\n  - { name: Rank, blank: Base }\n  - { name: Age, blank: Adult }\n";
    const sheet = readCsv(files["races/races.csv"]);
    sheet.rows.push({ ...sheet.rows[0], Age: "Old", WS: "2" });
    withAge["races/races.csv"] = writeCsv({ columns: [...sheet.columns, "Age"], rows: sheet.rows });
    const { items, problems } = loadFolder(withAge);
    expect(problems).toEqual([]);
    expect(items.find((i): i is Game => i.kind === "game")!.raceDimensions).toHaveLength(4);
    const old = items.find((i): i is RaceProfile => i.kind === "race-profile" && i.profile["Age"] === "Old")!;
    expect(old.key).toBe("tow.race.human.core.base.old");
    expect(old.name).toBe("Human · Core · Base · Old");
    expect(items.some((i) => i.key === "tow.race.human.core.base.adult")).toBe(true);
    const back = readCsv(saveFolder(items)["races/races.csv"]);
    expect(back.columns).toContain("Age");
    expect(back.rows.find((r) => r.Age === "Old")?.WS).toBe("2");
  });
});

describe("the race table, any way round", () => {
  const { items } = loadFolder(files);
  const profiles = items.filter((i): i is RaceProfile => i.kind === "race-profile");
  const dims = [{ name: "Race" }, { name: "Tree", blank: "Core" }, { name: "Rank", blank: "Base" }];
  const stats = ["M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];
  it("Race × Rank, every stat, only Tree Core", async () => {
    const { raceTable } = await import("../src/library/race-table");
    const t = raceTable(profiles, dims, stats, { down: ["Race", "Rank"], across: "Stats", stat: "", only: { Tree: "Core" } });
    expect(t.labelColumns).toEqual(["Race", "Rank"]);
    expect(t.rows[0].label).toEqual(["Human", "Base"]);
    expect(t.rows[0].cells.slice(0, 2)).toEqual(["4", "3"]);
  });
  it("Race × Tree, WS across", async () => {
    const { raceTable } = await import("../src/library/race-table");
    const t = raceTable(profiles, dims, stats, { down: ["Race"], across: "Tree", stat: "WS", only: { Rank: "Base" } });
    expect(t.columns).toContain("Core");
    expect(t.rows.find((r) => r.label[0] === "Human")!.cells[t.columns.indexOf("Core")]).toBe("3");
  });
});

describe("changing the dimensions applies at once", () => {
  it("renaming Tree to Path renames it in every profile and unit; keys stay", async () => {
    const { changeDimensions } = await import("../src/items/race-dimensions");
    const { items } = loadFolder(files);
    const game = items.find((i): i is Game => i.kind === "game")!;
    const dims = [{ name: "Race" }, { name: "Path", blank: "Core" }, { name: "Rank", blank: "Base" }];
    const { items: after, problems } = changeDimensions(items, game, { dims, renames: { Tree: "Path" } });
    expect(problems).toEqual([]);
    const human = after.find((i): i is RaceProfile => i.key === "tow.race.human.core.base")!;
    expect(human.profile).toEqual({ Race: "Human", Path: "Core", Rank: "Base" });
    const knights = after.find((i) => i.key === "tow.unit.empire-knights") as any;
    expect(knights.rows[0].profile).toEqual({ Race: "Human", Rank: "Veteran", Path: "Professional" });
  });
  it("adding Age (blank Adult) re-keys profiles and their packages' lists", async () => {
    const { changeDimensions } = await import("../src/items/race-dimensions");
    const { items } = loadFolder(files);
    const game = items.find((i): i is Game => i.kind === "game")!;
    const dims = [{ name: "Race" }, { name: "Tree", blank: "Core" }, { name: "Rank", blank: "Base" }, { name: "Age", blank: "Adult" }];
    const { items: after } = changeDimensions(items, game, { dims, renames: {} });
    expect(after.some((i) => i.key === "tow.race.human.core.base.adult")).toBe(true);
    expect((after.find((i) => i.key === "tow.races") as any).members).toContain("tow.race.human.core.base.adult");
  });
  it("removing the dimension that tells two profiles apart changes nothing, and says why", async () => {
    const { changeDimensions } = await import("../src/items/race-dimensions");
    const { items } = loadFolder(files);
    const game = items.find((i): i is Game => i.kind === "game")!;
    const { items: after, problems } = changeDimensions(items, game, { dims: [{ name: "Race" }], renames: {} });
    expect(problems.length).toBeGreaterThan(0);
    expect(after).toBe(items);
  });
});

describe("unit stats are differences from their race (races-and-units.md §2)", () => {
  it("a change to the race flows down to the unit, and the sheet prints it", async () => {
    const { unitAsPrinted } = await import("../src/rules/race-deltas");
    const { items } = loadFolder(files);
    // Human · Core · Base WS 3 -> 4: State Missile Troops (entered WS 3, the same as the race) follow.
    const human = items.find((i): i is RaceProfile => i.key === "tow.race.human.core.base")!;
    const changed = items.map((i) => (i.key === human.key ? { ...human, stats: { ...human.stats, WS: 4 } } : i));
    const smt = changed.find((i) => i.key === "tow.unit.state-missile-troops") as any;
    expect(unitAsPrinted(smt, changed).rows[0].stats.WS).toBe(4);
    expect(readCsv(saveFolder(changed)["forces-of-fantasy/the-empire/units.csv"]).rows.find((r) => r.Unit === "State Missile Troops")!.WS).toBe("4");
  });
  it("blank stays blank, and a stat that isn't a plain number stays as entered", async () => {
    const { items } = loadFolder(files);
    const horse = items.find((i) => i.key === "tow.unit.barded-warhorse") as any;
    expect(horse.rows[0].stats).toEqual({});
  });
});

describe("with no matching race, a difference from 0 (owner, 24 Nov)", () => {
  it("a unit whose race isn't loaded yet is stored against nothing, and moved onto the race when it arrives", async () => {
    const { unitAsPrinted } = await import("../src/rules/race-deltas");
    const noRaces = Object.fromEntries(Object.entries(files).filter(([p]) => !p.startsWith("races/")));
    noRaces["game.yaml"] = noRaces["game.yaml"].replace(/core: \[[^\]]*\]/, (m) => m.replace(/,?\s*Races/, ""));
    const before = loadFolder(noRaces).items;
    const smt = before.find((i) => i.key === "tow.unit.state-missile-troops") as any;
    expect(smt.rows[0].stats.WS).toEqual({ change: 3, asPrinted: true, against: "none" });
    expect(unitAsPrinted(smt, before).rows[0].stats.WS).toBe(3);
    // The races arrive: the difference moves onto Human · Core · Base.
    const after = loadFolder(files).items;
    const { refreshLibrary } = await import("../src/library/library");
    const merged = refreshLibrary([...before.filter((i) => !after.some((a) => a.key === i.key)), ...after.filter((a) => a.kind === "race-profile" || a.key === "tow.races"), ...before.filter((i) => after.some((a) => a.key === i.key) && i.kind !== "race-profile")]).items;
    const smt2 = merged.find((i) => i.key === "tow.unit.state-missile-troops") as any;
    expect(smt2.rows[0].stats.WS).toEqual({ change: 0, asPrinted: true, against: "tow.race.human.core.base" });
    expect(unitAsPrinted(smt2, merged).rows[0].stats.WS).toBe(3);
  });
});
