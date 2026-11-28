// Spells and lores (design/options-items-and-rules.md §5; owner, 28 Nov: "spells tab is good"). A
// Spells tab; a Lores tab with one row per spell in a lore (rows sharing a name are one lore). A
// unit's rule or rules option naming a lore gives it that lore's spells, on its card and in the
// rules reference; a spell a lore names but nobody entered is a stub.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Lore, Spell, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, viewRoster } from "../src/lists/roster";
import { armyReference, gameUnits } from "../src/lists/game-view";
import { cellDifferences, loadFolder, saveFolder } from "./helpers";
import { readFolder } from "./read-folder";
import { readCsv } from "../src/sheets/csv";

const BOOK = "forces-of-fantasy/the-empire/";

function withSpells(files: Record<string, string>): Record<string, string> {
  const units = files[BOOK + "units.csv"];
  const columns = units.split("\n")[0].trim().split(",");
  const row = (cells: Record<string, string>) => columns.map((c) => cells[c] ?? "").join(",");
  return {
    ...files,
    [BOOK + "spells.csv"]: "Spell,Type,Casting Value,Range,Rules,Rules 2,Reference\n" +
      'Test Bolt,Magic Missile,9+,"24""",Flaming Attacks,The target suffers 2D6 hits.,Test;1\n' +
      "Test Ward,Enchantment,7+ / 11+,Self,,Re-roll failed saves.,Test;1\n",
    [BOOK + "lores.csv"]: "Lore,Spell,Signature,Group,Rules 2,Reference\n" +
      "Test Lore,Test Bolt,yes,,A made-up lore.,Test;1\n" +
      "Test Lore,Test Ward,,,,\n" +
      "Test Lore,Test Unentered,,,,\n",
    [BOOK + "units.csv"]: units.trimEnd() + "\n" +
      row({ Package: "Forces of Fantasy", SubPackage: "The Empire of Man", "Rule Type": "Army List", Unit: "Test Wizard", Type: "Unit", Name: "Test Wizard", Tier: "Characters", M: "4", WS: "3", BS: "3", S: "3", T: "3", W: "2", I: "3", A: "1", Ld: "7", Cost: "60", Equipment: "Hand Weapon", "Min/Max": "1", Slots: "None", Rules: "Test Lore", Reference: "Test;1" }) + "\n",
  };
}

describe("spells and lores", () => {
  const files = withSpells(readFolder(join(__dirname, "fixtures/tow-sample")));
  const { items, problems, stubbed } = loadFolder(files);
  const lore = items.find((i): i is Lore => i.kind === "lore")!;

  it("reads spells, and a lore's rows as one lore in order", () => {
    expect(problems).toEqual([]);
    expect(items.find((i): i is Spell => i.kind === "spell" && i.name === "Test Ward")).toMatchObject({ spellType: "Enchantment", castingValue: "7+ / 11+", range: "Self" });
    expect(lore.name).toBe("Test Lore");
    expect(lore.text).toBe("A made-up lore.");
    expect(lore.spells.map((m) => [m.spell.name, m.signature ?? false])).toEqual([["Test Bolt", true], ["Test Ward", false], ["Test Unentered", false]]);
    expect(lore.spells[0].spell.item).toBe("tow.spell.test-bolt");
  });

  it("makes a stub of a spell a lore names that isn't entered", () => {
    expect(stubbed.map((u) => u.name)).toContain("Test Unentered");
    expect(items.find((i) => i.key === "tow.spell.test-unentered")).toMatchObject({ kind: "spell", status: "stub" });
  });

  it("gives back every cell as typed", () => {
    expect(cellDifferences(files, saveFolder(items), readCsv)).toEqual([]);
  });

  it("lets a unit's rule name a lore, and lists its spells on the card and in the reference", () => {
    const wizard = items.find((i): i is Unit => i.kind === "unit" && i.name === "Test Wizard")!;
    expect(wizard.rows[0].rules[0].item).toBe(lore.key);
    const tow = items.find((i): i is Game => i.kind === "game")!;
    const context = switchOn(newContext("Test", tow, items), "tow.the-empire", items);
    const all: Item[] = [...items, context];
    const r = addUnit(newRoster("Spells", context as Context, armyListsIn(context, all)[0], 1000, all), wizard, all);
    const units = gameUnits(viewRoster(r, all), all);
    expect(units[0].spells).toEqual([{ lore: { name: "Test Lore", key: lore.key }, spells: [
      { name: "Test Bolt", key: "tow.spell.test-bolt" }, { name: "Test Ward", key: "tow.spell.test-ward" }, { name: "Test Unentered", key: "tow.spell.test-unentered" }] }]);
    const spells = armyReference(units, all).find((s) => s.title === "Spells")!;
    expect(spells.groups[0].type).toBe("Test Lore");
    expect(spells.groups[0].entries[0]).toMatchObject({ name: "Test Bolt", facts: ["Magic Missile", "Casting value 9+", 'Range 24"', "Flaming Attacks"], text: "The target suffers 2D6 hits." });
    expect(spells.groups[0].entries[2].text).toBe("Not entered yet.");
  });
});
