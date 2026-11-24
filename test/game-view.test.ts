// The game view: each unit as you'd want it at the table, and a battle's tally.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, toggleChoice, toggleItem, viewRoster } from "../src/lists/roster";
import { battleTally, gameUnits } from "../src/lists/game-view";
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
  it("shows the unit's lines: its own, the Preceptor (A +1 applied), its horse", () => {
    const g = gameUnits(viewRoster(knights(), all), all)[0];
    expect(g.lines.map((l) => l.name)).toEqual(["Empire Knight", "Preceptor", "Barded Warhorse"]);
    expect(g.lines[1].stats.A).toBe(2);
    expect(g.lines[2].stats.M).toBe(8); // the horse's line comes from the Horse race profile
  });
  it("its kit with the options taken, its rules with those taken, its magic items", () => {
    const g = gameUnits(viewRoster(knights(), all), all)[0];
    expect(g.equipment).toEqual(["Hand Weapon", "Heavy Armour", "Shield", "Lances"]);
    expect(g.rules.map((r) => r.name)).toContain("Drilled");
    expect(g.items).toEqual([{ name: "Sample Blade", type: "magic weapon", bearer: "Preceptor", key: "tow.magic-item.sample-blade" }]);
    expect(g.command).toEqual(["Preceptor"]);
  });
  it("a battle: units dead or fleeing; scenario points kept apart", () => {
    const r = { ...knights(), battle: { units: { u1: "dead" as const }, generalLost: false, bsbLost: false, banners: 1, scenario: 3 } };
    const view = viewRoster(r, all);
    const t = battleTally(view, all);
    expect(t.destroyed).toBe(view.units[0].points);
    expect(t.total).toBe(view.units[0].points); // no banner value set for this game: counted, not scored
    expect(t.scenario).toBe(3);
  });
});
