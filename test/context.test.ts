// Contexts: a game and the packages switched on for it (a pick-up game has no world).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Game, Item } from "../src/items/items";
import { newContext, offered, readContext, switchOff, switchOn } from "../src/context/context";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const tow = items.find((i): i is Game => i.kind === "game")!;
const keys = (v: ReturnType<typeof readContext>) => v.packages.filter((p) => p.on).map((p) => p.key);

describe("a pick-up game's context", () => {
  const friday = newContext("Friday night", tow, items);

  it("starts with the game's core and its default composition set, and no world", () => {
    expect(friday).toMatchObject({ key: "context.friday-night", game: "tow", books: [], composition: [{ package: "tow.standard-composition", on: true }] });
    expect(friday.world).toBeUndefined();
    const view = readContext(friday, items);
    expect(keys(view)).toEqual(["tow.rulebook", "tow.races", "tow.standard-composition"]);
    expect(view.packages[0]).toMatchObject({ name: "Rulebook", how: "core" });
    expect(view.warnings).toEqual([]);
  });

  it("offers this game's books, not its core, not campaign packages", () => {
    const offer = offered(friday, items);
    expect(offer.get("books")!.map((p) => p.key).sort()).toEqual(["tow.forces-of-fantasy", "tow.the-empire"]);
    expect(offer.has("campaign")).toBe(false);
  });

  it("switching on the Empire brings what it needs, needs first, marked by what needs them", () => {
    const view = readContext(switchOn(friday, "tow.the-empire", items), items);
    expect(keys(view)).toEqual(["tow.rulebook", "tow.races", "tow.forces-of-fantasy", "tow.the-empire", "tow.standard-composition"]);
    expect(view.packages.find((p) => p.key === "tow.forces-of-fantasy")).toMatchObject({ how: "needed", neededBy: ["The Empire of Man"] });
  });

  it("a needed package switched off by hand stays off, with a warning", () => {
    let ctx = switchOn(friday, "tow.the-empire", items);
    ctx = switchOff(ctx, "tow.forces-of-fantasy", items);
    const view = readContext(ctx, items);
    expect(view.on.has("tow.forces-of-fantasy")).toBe(false);
    expect(view.warnings).toContain("The Empire of Man needs Forces of Fantasy, which is switched off here");
  });

  it("with no composition set switched on, says only the army lists' own limits apply", () => {
    const view = readContext(switchOff(friday, "tow.standard-composition", items), items);
    expect(view.warnings).toContain("no composition set: only the army lists' own limits apply");
  });

  it("warns about a package of another game", () => {
    const other: Item[] = [...items, { key: "wfb6.house", kind: "package", name: "6th house rules", game: "wfb6", layer: "house", members: [], includes: [], needsStated: [] }];
    const view = readContext({ ...friday, house: [{ package: "wfb6.house", on: true }] }, other);
    expect(view.warnings).toContain("6th house rules is for another game (wfb6)");
  });
});

describe("composition sets and sections", () => {
  it("Standard composition is a composition set; Races sits under App specific", async () => {
    const { packageType } = await import("../src/library/package-types");
    const byKey = new Map(items.map((i) => [i.key, i]));
    expect(packageType(byKey.get("tow.standard-composition") as any, byKey)).toBe("composition");
    expect(byKey.get("tow.races")).toMatchObject({ name: "Races", section: "App specific" });
    expect(tow.defaultComposition).toEqual(["tow.standard-composition"]);
  });
});
