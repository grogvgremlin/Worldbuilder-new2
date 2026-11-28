// A command slot taken by a number of models (owner, 28 Nov: "isn't this slots?"): "any number of
// models may be upgraded to Giant Slayers, +7 points per model". Written as a slot whose row has a
// Min/Max other than 0-1; costed per model taken; no more than the unit holds.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, setSlotCount, updateUnit, viewRoster } from "../src/lists/roster";
import { gameUnits } from "../src/lists/game-view";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const UNITS = "forces-of-fantasy/the-empire/units.csv";

function withSlayers(files: Record<string, string>): Record<string, string> {
  const columns = files[UNITS].split("\n")[0].trim().split(",");
  const row = (cells: Record<string, string>) => columns.map((c) => cells[c] ?? "").join(",");
  const common = { Package: "Forces of Fantasy", SubPackage: "The Empire of Man", "Rule Type": "Army List", Unit: "Test Slayers", Reference: "Test;1" };
  return {
    ...files,
    [UNITS]: files[UNITS].trimEnd() + "\n" +
      row({ ...common, Type: "Unit", Name: "Troll Slayer", Tier: "Core", M: "3", WS: "4", BS: "3", S: "3", T: "4", W: "1", I: "2", A: "1", Ld: "10", Cost: "12~pi", Equipment: "Hand Weapon", "Min/Max": "5-", Slots: "GS(slots)" }) + "\n" +
      row({ ...common, Type: "Slots-Upgrade", "Link Key": "GS", Name: "Giant Slayer", WS: "+1", A: "+1", Cost: "+7", "Min/Max": "0-" }) + "\n",
  };
}

describe("a command slot taken by a number of models", () => {
  const { items, problems } = loadFolder(withSlayers(readFolder(join(__dirname, "fixtures/tow-sample"))));
  const tow = items.find((i): i is Game => i.kind === "game")!;
  const context = switchOn(newContext("Test", tow, items), "tow.the-empire", items);
  const all: Item[] = [...items, context];
  const list = armyListsIn(context, all)[0];
  const start = () => {
    let r = newRoster("Slayers", context as Context, list, 1000, all);
    r = addUnit(r, all.find((i): i is Unit => i.kind === "unit" && i.name === "Test Slayers")!, all);
    return updateUnit(r, "u1", { size: 10 });
  };

  it("reads with no problems and offers the slot as a count", () => {
    expect(problems).toEqual([]);
    const choice = viewRoster(start(), all).units[0].choices.flatMap((g) => g.choices).find((c) => c.label === "Giant Slayer")!;
    expect(choice.counted).toEqual({ most: null });
    expect(choice.costText).toContain("each");
  });

  it("costs each model taken", () => {
    const view = viewRoster(setSlotCount(start(), "u1", "Giant Slayer", 3), all).units[0];
    expect(view.points).toBe(10 * 12 + 3 * 7);
    expect(view.breakdown).toContain("Giant Slayer: 3 × 7 = 21");
  });

  it("stores only the choice, and 0 takes the slot off", () => {
    const three = setSlotCount(start(), "u1", "Giant Slayer", 3).units[0];
    expect(three.slots).toEqual(["Giant Slayer"]);
    expect(three.slotCounts).toEqual({ "Giant Slayer": 3 });
    const none = setSlotCount(setSlotCount(start(), "u1", "Giant Slayer", 3), "u1", "Giant Slayer", 0).units[0];
    expect(none.slots).toEqual([]);
    expect(none.slotCounts).toBeUndefined();
  });

  it("can't take more than the unit holds", () => {
    const view = viewRoster(setSlotCount(start(), "u1", "Giant Slayer", 12), all);
    expect(view.issues.map((i) => i.message)).toContain("12 Giant Slayers in a unit of 10");
  });

  it("shows the count on the game view's line", () => {
    const r = setSlotCount(start(), "u1", "Giant Slayer", 3);
    const unit = gameUnits(viewRoster(r, all), all)[0];
    expect(unit.lines.map((l) => l.name)).toContain("Giant Slayer ×3");
  });
});
