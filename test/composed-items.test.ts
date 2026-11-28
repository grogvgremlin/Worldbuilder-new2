// Items made of parts (design/options-items-and-rules.md §3, "composed items"; the Dwarfs' runes,
// owner 28 Nov): an item marked Repeats may be taken more than once by one bearer, adding up; and
// "each set[filter]~0-1~army" stops two bearers holding the same set (the Rule of Pride).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addItemAgain, addUnit, armyListsIn, itemChoices, newRoster, takeOneOff, toggleItem, viewRoster } from "../src/lists/roster";
import { gameUnits } from "../src/lists/game-view";
import { cellDifferences, loadFolder, saveFolder } from "./helpers";
import { readFolder } from "./read-folder";
import { readCsv } from "../src/sheets/csv";

const BOOK = "forces-of-fantasy/the-empire/";

function withRunes(files: Record<string, string>): Record<string, string> {
  const units = files[BOOK + "units.csv"];
  const columns = units.split("\n")[0].trim().split(",");
  const row = (cells: Record<string, string>) => columns.map((c) => cells[c] ?? "").join(",");
  const common = { Package: "Forces of Fantasy", SubPackage: "The Empire of Man", Reference: "Test;1" };
  return {
    ...files,
    [BOOK + "magic-items.csv"]: "Magic Item,Type,Match Key,M,WS,BS,S,T,W,I,A,Ld,Save,Rules,Rules 2,R,AP,Cost,Reference,Repeats\n" +
      files[BOOK + "magic-items.csv"].split("\n").slice(1).filter(Boolean).map((l) => l + ",").join("\n") + "\n" +
      "Rune of Test Might,test rune,,,,,+1,,,,,,,,,,,20,Test;1,yes\n" +
      "Rune of Test Fire,test rune,,,,,,,,,,,,,,,,10,Test;1,\n",
    [BOOK + "equipment.csv"]: files[BOOK + "equipment.csv"].trimEnd() + "\nTest Runes,,,,,,,,,,,,Only(test rune),,runes for tests,allowance,,,,Test;1\n",
    [BOOK + "units.csv"]: units.trimEnd() + "\n" +
      row({ ...common, "Rule Type": "Army List", Unit: "Test Thane", Type: "Unit", Name: "Test Thane", Tier: "Characters", M: "3", WS: "6", BS: "4", S: "4", T: "5", W: "2", I: "3", A: "3", Ld: "9", Cost: "60", Equipment: "Hand Weapon", "Min/Max": "1", "Troop Type": "Heavy Infantry (Character)", Slots: "None", "Equipment Options": "Test Runes(;0-75 total)" }) + "\n",
    [BOOK + "composition.csv"]: files[BOOK + "composition.csv"].trimEnd() + "\n" +
      row({ ...common, "Rule Type": "Composition", Type: "Composition", Name: "Rule of Pride", "Unit Limit": "each set[Type(test rune)]~0-1~army" }) + "\n",
  };
}

describe("items made of parts", () => {
  const files = withRunes(readFolder(join(__dirname, "fixtures/tow-sample")));
  const { items, problems } = loadFolder(files);
  const tow = items.find((i): i is Game => i.kind === "game")!;
  const context = switchOn(newContext("Test", tow, items), "tow.the-empire", items);
  const base: Item[] = [...items, context];
  const list = armyListsIn(context, base)[0];
  const thane = base.find((i): i is Unit => i.kind === "unit" && i.name === "Test Thane")!;
  const MIGHT = "tow.magic-item.rune-of-test-might";
  const FIRE = "tow.magic-item.rune-of-test-fire";
  const twoThanes = () => addUnit(addUnit(newRoster("Runes", context as Context, list, 2000, base), thane, base), thane, base);
  const all = (r: Roster) => [...base, r];
  const choice = (r: Roster, unit: string, key: string) => itemChoices(r, all(r), unit, "options", "Test Runes").find((c) => c.item.key === key)!;

  it("reads Repeats and gives it back", () => {
    expect(problems).toEqual([]);
    expect(items.find((i) => i.key === MIGHT)).toMatchObject({ repeats: true });
    expect(cellDifferences(files, saveFolder(items), readCsv)).toEqual([]);
  });

  it("takes an item that repeats again, costs each, and shows it once with a count", () => {
    let r = toggleItem(twoThanes(), "u1", "options", "Test Runes", MIGHT);
    expect(choice(r, "u1", MIGHT)).toMatchObject({ picked: true, count: 1 });
    expect(choice(r, "u1", MIGHT).again).toBeUndefined();
    r = addItemAgain(r, "u1", "options", "Test Runes", MIGHT);
    expect(choice(r, "u1", MIGHT).count).toBe(2);
    expect(viewRoster(r, all(r)).units[0].points).toBe(60 + 40);
    expect(gameUnits(viewRoster(r, all(r)), all(r))[0].items.map((i) => i.name)).toEqual(["Rune of Test Might ×2"]);
    r = takeOneOff(r, "u1", "options", "Test Runes", MIGHT);
    expect(choice(r, "u1", MIGHT).count).toBe(1);
  });

  it("stops a repeat over the budget", () => {
    let r = toggleItem(twoThanes(), "u1", "options", "Test Runes", MIGHT);
    r = addItemAgain(addItemAgain(r, "u1", "options", "Test Runes", MIGHT), "u1", "options", "Test Runes", MIGHT);
    expect(choice(r, "u1", MIGHT).again).toBe("80 pts would be over 75");
  });

  it("doesn't repeat an item that isn't marked", () => {
    const r = toggleItem(twoThanes(), "u1", "options", "Test Runes", FIRE);
    expect(choice(r, "u1", FIRE).again).toBeUndefined();
    expect(choice(r, "u1", FIRE).item.repeats).toBeUndefined();
  });

  it("stops two bearers holding the same set (Rule of Pride), but not different sets", () => {
    let r = toggleItem(twoThanes(), "u1", "options", "Test Runes", FIRE);
    expect(choice(r, "u2", FIRE).why).toBe("Rule of Pride: 2 the same (Rune of Test Fire), at most 1");
    r = toggleItem(r, "u1", "options", "Test Runes", MIGHT);
    expect(choice(r, "u2", FIRE).why).toBeUndefined();
  });
});
