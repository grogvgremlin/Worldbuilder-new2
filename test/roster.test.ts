// Rosters in a pick-up game: costs, choices, composition and limits.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, newRoster, toggleChoice, updateUnit, viewRoster } from "../src/lists/roster";
import { loadFolder } from "./helpers";
import { hasTowData, readFolder, TOW_DATA } from "./read-folder";

function pickupGame(items: Item[]) {
  const tow = items.find((i): i is Game => i.kind === "game")!;
  const context = switchOn(newContext("Friday night", tow, items), "tow.the-empire", items);
  const all = [...items, context];
  const empire = armyListsIn(context, all)[0];
  return { all, context, empire };
}

function add(roster: Roster, items: Item[], key: string, size?: number): Roster {
  const unit = items.find((i): i is Unit => i.key === key)!;
  let r = addUnit(roster, unit, items);
  const id = r.units[r.units.length - 1].id;
  if (size) r = updateUnit(r, id, { size });
  return r;
}

function pick(roster: Roster, items: Item[], id: string, label: string): Roster {
  const unit = viewRoster(roster, items).units.find((u) => u.rosterUnit.id === id)!;
  for (const g of unit.choices) {
    const c = g.choices.find((x) => x.label === label);
    if (c) return toggleChoice(roster, id, g, c);
  }
  throw new Error(`no choice ${label}: ${unit.choices.flatMap((g) => g.choices.map((c) => c.label)).join(", ")}`);
}

describe("a pick-up roster (sample)", () => {
  const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
  const { all, context, empire } = pickupGame(items);

  it("offers the Empire's army list in the game", () => {
    expect(empire.name).toBe("The Empire of Man");
  });

  it("costs Handgunners: 10 × 7, handguns, a Sergeant and a musician", () => {
    let r = newRoster("Friday 1,000", context as Context, empire, 1000, all);
    r = add(r, all, "tow.unit.state-missile-troops");
    r = pick(r, all, "u1", "Handguns instead of Crossbow");
    r = pick(r, all, "u1", "Sergeant");
    r = pick(r, all, "u1", "Musician");
    const view = viewRoster(r, all);
    expect(view.units[0].points).toBe(90);
    expect(view.units[0].breakdown).toEqual(["10 × 7 = 70", "Sergeant +5", "Musician +5", "Handguns instead of Crossbow: 10 × 1 = 10"]);
    expect(view.total).toBe(90);
  });

  it("checks composition from the Standard set and the book-wide rules", () => {
    let r = newRoster("Friday 1,000", context as Context, empire, 1000, all);
    r = add(r, all, "tow.unit.state-missile-troops");
    const messages = viewRoster(r, all).issues.map((i) => i.message);
    expect(messages).toContain("Core: 70 pts, at least 25%");
    expect(messages).toContain("The General: 0 taken, needs 1");
    expect(messages).toContain("Minimum Three Units: 1 taken, needs 3");
  });

  it("a choose-one group takes one; a required one must be chosen", () => {
    let r = newRoster("x", context as Context, empire, 1000, all);
    r = add(r, all, "tow.unit.empire-knights");
    expect(viewRoster(r, all).units[0].issues.map((i) => i.message)[0]).toMatch(/Empire Knights: choose one of Great Weapons, Lances/);
    r = pick(r, all, "u1", "Lances");
    r = pick(r, all, "u1", "Great Weapons");
    const u = viewRoster(r, all).units[0];
    expect(r.units[0].picks).toEqual(["options|Great Weapons"]);
    expect(u.issues).toEqual([]);
  });

  it("a unit's own limit on its special-rule options: 0–1 per 1,000", () => {
    let r = newRoster("x", context as Context, empire, 1000, all);
    r = add(r, all, "tow.unit.empire-knights");
    r = add(r, all, "tow.unit.empire-knights");
    r = pick(pick(r, all, "u1", "Drilled"), all, "u2", "Stubborn");
    expect(viewRoster(r, all).issues.map((i) => i.message)).toContain("Empire Knights (rules options): 2 taken, 0–1 per 1,000 pts");
  });

  it("the size is checked against the unit's", () => {
    let r = newRoster("x", context as Context, empire, 1000, all);
    r = add(r, all, "tow.unit.state-missile-troops", 8);
    expect(viewRoster(r, all).issues.map((i) => i.message)).toContain("State Missile Troops: at least 10 models");
  });
});

describe.skipIf(!hasTowData)("a legal 1,000-point Empire list (private data)", () => {
  const { items } = hasTowData ? loadFolder(readFolder(TOW_DATA)) : { items: [] as Item[] };
  const { all, context, empire } = hasTowData ? pickupGame(items) : ({} as ReturnType<typeof pickupGame>);

  it("builds, costs and passes", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.captain-of-the-empire");
    r = updateUnit(r, "u1", { general: true });
    r = pick(r, all, "u1", "Great Weapon");
    r = add(r, all, "tow.unit.state-troops", 20);
    r = pick(pick(pick(r, all, "u2", "Halberds"), all, "u2", "Standard Bearer"), all, "u2", "Musician");
    r = add(r, all, "tow.unit.state-missile-troops");
    r = pick(r, all, "u3", "Handguns instead of Crossbow");
    r = add(r, all, "tow.unit.empire-knights", 5);
    r = pick(r, all, "u4", "Lances");
    r = add(r, all, "tow.unit.great-cannon");
    const view = viewRoster(r, all);
    expect(view.issues).toEqual([]);
    // Captain 45 + great weapon 4; State Troops 20×5 + halberds 20 + SB 5 + M 5; Handgunners 70 + 10; Knights 105 + 5; Cannon 125
    expect(view.units.map((u) => u.points)).toEqual([49, 130, 80, 110, 125]);
    expect(view.total).toBe(494);
    expect(view.categories.find((c) => c.category === "Core")).toMatchObject({ points: 320, ok: true });
  });

  it("two Helblasters at 1,000 points break the army's 0–1 per 1,000", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(add(r, all, "tow.unit.helblaster-volley-gun"), all, "tow.unit.helblaster-volley-gun");
    expect(viewRoster(r, all).issues.map((i) => i.message)).toContain("Rare war machines: 2 taken, 0–1 per 1,000 pts");
  });

  it("the Captain inherits the General's options, with his own magic item allowance", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.captain-of-the-empire");
    const u = viewRoster(r, all).units[0];
    const labels = u.choices.flatMap((g) => g.choices.map((c) => c.label));
    expect(labels).toEqual(expect.arrayContaining(["Great Weapon", "Shield", "Barded Warhorse", "Battle Standard Bearer"]));
    expect(u.choices.map((g) => g.allowance).filter(Boolean)).toContain("Magic Items: up to 50 pts (picking items comes later)");
  });
});
