// Magic items: their own kind and tab, picked through allowances, kept to budgets and to the rules
// about them written in the data (owner, 23 Nov). The sample's items are made up, not book data.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, MagicItem, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, itemChoices, newRoster, toggleChoice, toggleItem, viewRoster } from "../src/lists/roster";
import { readCsv } from "../src/sheets/csv";
import { loadFolder, saveFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items, problems } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const tow = items.find((i): i is Game => i.kind === "game")!;
const context: Context = switchOn(newContext("Friday", tow, items), "tow.the-empire", items);
const all: Item[] = [...items, context];
const knights = all.find((i): i is Unit => i.key === "tow.unit.empire-knights")!;
const missile = all.find((i): i is Unit => i.key === "tow.unit.state-missile-troops")!;
const PRECEPTOR = "slot:Preceptor";

function withCommand(r: Roster, id: string, name: string): Roster {
  const g = viewRoster(r, all).units.find((u) => u.rosterUnit.id === id)!.choices.find((c) => c.where === "command")!;
  return toggleChoice(r, id, g, g.choices.find((c) => c.label === name)!);
}
const at = (r: Roster) => all.map((i) => (i.key === r.key ? r : i)).concat(all.some((i) => i.key === r.key) ? [] : [r]);
const why = (r: Roster, id: string, where: string, allowance: string, name: string) => itemChoices(r, at(r), id, where, allowance).find((c) => c.item.name === name)!.why;

function knightsWithPreceptor(): Roster {
  let r = newRoster("x", context, armyListsIn(context, all)[0], 1000, all);
  r = addUnit(addUnit(r, knights, all), knights, all);
  return withCommand(withCommand(r, "u1", "Preceptor"), "u2", "Preceptor");
}

describe("magic items as their own kind", () => {
  it("read from the Magic Items tab, typed; a trailing * is extremely common", () => {
    expect(problems).toEqual([]);
    const charm = items.find((i): i is MagicItem => i.key === "tow.magic-item.sample-charm")!;
    expect(charm).toMatchObject({ kind: "magic-item", name: "Sample Charm", type: "talisman", extremelyCommon: true });
  });
  it("written back with the *", () => {
    const rows = readCsv(saveFolder(items)["forces-of-fantasy/the-empire/magic-items.csv"]).rows;
    expect(rows.map((r) => r["Magic Item"])).toContain("Sample Charm*");
  });
  it("a magic item without a type is flagged", () => {
    const files = readFolder(join(__dirname, "fixtures/tow-sample"));
    files["forces-of-fantasy/the-empire/magic-items.csv"] = "Magic Item,Type,Cost\r\nNo Type Thing,,5\r\n";
    expect(loadFolder(files).problems.map((p) => p.message)).toEqual(['"No Type Thing" needs a type (magic weapon, talisman …): the rules about magic items go by type']);
  });
});

describe("picking them on a roster", () => {
  it("an allowance offers only its types: Magic Items, not standards", () => {
    const names = itemChoices(knightsWithPreceptor(), all, "u1", PRECEPTOR, "Magic Items").map((c) => c.item.name);
    expect(names).toEqual(["Sample Blade", "Sample Shield", "Sample Charm", "Sample Ring"]);
  });

  it("costs the item and keeps to the budget (25 pts)", () => {
    let r = knightsWithPreceptor();
    r = toggleItem(r, "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-blade");
    const u = viewRoster(r, at(r)).units[0];
    expect(u.breakdown).toContain("Sample Blade (Preceptor) 20");
    expect(why(r, "u1", PRECEPTOR, "Magic Items", "Sample Shield")).toBe("35 pts would be over 25");
    expect(why(r, "u1", PRECEPTOR, "Magic Items", "Sample Ring")).toBeUndefined(); // 25: just in
  });

  it("one of each type per bearer, from the rule in the data", () => {
    let r = knightsWithPreceptor();
    r = toggleItem(r, "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-ring");
    expect(why(r, "u1", PRECEPTOR, "Magic Items", "Sample Charm")).toBe("One of each type per bearer: talisman 2 taken by one bearer, at most 1");
  });

  it("each item once per army, unless extremely common", () => {
    let r = knightsWithPreceptor();
    r = toggleItem(r, "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-ring");
    expect(why(r, "u2", PRECEPTOR, "Magic Items", "Sample Ring")).toBe("Each item once per army: Sample Ring 2 taken, at most 1");
    r = toggleItem(r, "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-ring");
    r = toggleItem(r, "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-charm");
    expect(why(r, "u2", PRECEPTOR, "Magic Items", "Sample Charm")).toBeUndefined();
  });

  it("an item's Only(...) is kept: the Knightly Pennant isn't offered to handgunners", () => {
    let r = newRoster("x", context, armyListsIn(context, all)[0], 1000, all);
    r = withCommand(addUnit(r, missile, all), "u1", "Standard Bearer");
    expect(why(r, "u1", "slot:Standard Bearer", "Magic Standard", "Knightly Pennant")).toBe("only for Empire Knights");
    expect(why(r, "u1", "slot:Standard Bearer", "Magic Standard", "Sample Banner")).toBeUndefined();
  });

  it("taking the command model off takes its items off", () => {
    let r = toggleItem(knightsWithPreceptor(), "u1", PRECEPTOR, "Magic Items", "tow.magic-item.sample-blade");
    r = withCommand(r, "u1", "Preceptor");
    expect(r.units[0].picks).toEqual([]);
  });

  it("a standard bearer's magic standard counts for SB(Magic Standard)~0-1~1000", () => {
    let r = newRoster("x", context, armyListsIn(context, all)[0], 1000, all);
    r = addUnit(addUnit(r, missile, all), missile, all);
    r = withCommand(withCommand(r, "u1", "Standard Bearer"), "u2", "Standard Bearer");
    r = toggleItem(r, "u1", "slot:Standard Bearer", "Magic Standard", "tow.magic-item.sample-banner");
    expect(viewRoster(r, at(r)).units[0].limits).toContain("SB (Magic Standard): 0–1 per 1,000 pts · 1 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
  });
});
