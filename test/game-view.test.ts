// The game view: each unit as you'd want it at the table, and a battle's tally.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, toggleChoice, toggleItem, viewRoster } from "../src/lists/roster";
import { gameUnits } from "../src/lists/game-view";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const tow = items.find((i): i is Game => i.kind === "game")!;
const context: Context = switchOn(newContext("Friday", tow, items), "tow.the-empire", items);
const all: Item[] = [...items, context];
const unit = (k: string) => all.find((i): i is Unit => i.key === k)!;
const choose = (r: Roster, id: string, label: string): Roster => {
  const u = viewRoster(r, all).units.find((x) => x.rosterUnit.id === id)!;
  const g = u.choices.find((g) => g.choices.some((c) => c.label === label))!;
  return toggleChoice(r, id, g, g.choices.find((c) => c.label === label)!);
};

function knights(): Roster {
  let r = newRoster("x", context, armyListsIn(context, all)[0], 1000, all);
  r = addUnit(r, unit("tow.unit.empire-knights"), all);
  r = { ...r, units: r.units.map((u) => ({ ...u, size: 5 })) };
  r = choose(choose(choose(r, "u1", "Lances"), "u1", "Preceptor"), "u1", "Drilled");
  return toggleItem(r, "u1", "slot:Preceptor", "Magic Items", "tow.magic-item.sample-blade");
}

describe("the game view", () => {
  it("lines: the unit's own unnamed, then the Preceptor (A +1 applied), then its horse (barding M -1)", () => {
    const g = gameUnits(viewRoster(knights(), all), all)[0];
    expect(g.lines.map((l) => l.name)).toEqual(["", "Preceptor", "Barded Warhorse"]);
    expect(g.lines[1].stats.A).toBe(2);
    expect(g.lines[2].stats.M).toBe(7); // Horse M 8, barding M -1
  });
  it("equipment with the options taken; command models with their own kit; rules with those taken", () => {
    const g = gameUnits(viewRoster(knights(), all), all)[0];
    expect(g.equipment.map((e) => e.name)).toEqual(["Hand Weapon", "Heavy Armour", "Shield", "Lances"]);
    expect(g.equipment[0].key).toBe("tow.equipment.hand-weapon"); // each opens its card
    expect(g.command).toEqual([{ section: "Command", models: [{ name: "Preceptor", key: "tow.slot.c", kit: [{ name: "Sample Blade", key: "tow.magic-item.sample-blade" }] }] }]);
    expect(g.rules.map((r) => r.name)).toContain("Drilled");
    expect(g.items).toEqual([]);
  });
  it("a magic standard is carried instead of the Standard (its allowance replaces it)", () => {
    let r = choose(knights(), "u1", "Standard Bearer");
    r = toggleItem(r, "u1", "slot:Standard Bearer", "Magic Standard", "tow.magic-item.sample-banner");
    const sb = gameUnits(viewRoster(r, all), all)[0].command[0].models.find((m) => m.name === "Standard Bearer")!;
    expect(sb.kit.map((k) => k.name)).toEqual(["Sample Banner"]);
  });
  it("an option taken instead of something takes it out of the kit (Great Weapons instead of Shield)", () => {
    let r = newRoster("x", context, armyListsIn(context, all)[0], 1000, all);
    r = choose(addUnit(r, unit("tow.unit.empire-knights"), all), "u1", "Great Weapons instead of Shield");
    expect(gameUnits(viewRoster(r, all), all)[0].equipment.map((e) => e.name)).toEqual(["Hand Weapon", "Heavy Armour", "Great Weapons"]);
  });
});

describe("headings: a column's own name unless the game renames it (owner, 24 Nov)", () => {
  it("ungrouped slots fall under the game's heading for Slots, or 'Slots'", async () => {
    const r = knights();
    expect(gameUnits(viewRoster(r, all), all)[0].command[0].section).toBe("Command"); // the sample's game.yaml: Slots -> Command
    const renamed = all.map((i) => (i.kind === "game" ? { ...i, headings: undefined } : i));
    expect(gameUnits(viewRoster(r, renamed), renamed)[0].command[0].section).toBe("Slots");
  });
});

describe("army summary cards", () => {
  it("collate the list's equipment by type, rules, and magic items, each with its units", async () => {
    const { armySummary } = await import("../src/lists/game-view");
    const cards = armySummary(gameUnits(viewRoster(knights(), all), all), all);
    expect(cards.map((c) => c.title)).toEqual(["Equipment", "Special rules", "Magic items"]);
    const kit = cards[0].groups;
    expect(kit.map((g) => g.type)).toEqual(["Hand weapons", "Armour"]);
    expect(kit[0].entries.map((e) => e.name)).toContain("Lances");
    expect(cards[2].groups[0]).toEqual({ type: "Magic weapon", entries: [{ name: "Sample Blade", key: "tow.magic-item.sample-blade", text: undefined, units: ["Empire Knights"] }] });
  });
});
