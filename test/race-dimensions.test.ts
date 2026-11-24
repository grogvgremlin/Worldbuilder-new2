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
