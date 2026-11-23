// Rosters in a pick-up game: costs, choices, composition and limits.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Game, Item, Roster, Unit } from "../src/items/items";
import { newContext, switchOn } from "../src/context/context";
import { addUnit, armyListsIn, itemChoices, newRoster, toggleChoice, updateUnit, viewRoster } from "../src/lists/roster";
import { loadFolder } from "./helpers";
import { passesFilter, readFilter } from "../src/lists/unit-filter";
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
    // The headings it's about go red: the General on Characters; three units on the rest.
    const about = (m: string) => viewRoster(r, all).issues.find((i) => i.message === m)!.categories;
    expect(about("Minimum Three Units: 1 taken, needs 3")).toEqual(["Core"]); // the sample has no characters
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
    r = pick(r, all, "u1", "Drilled");
    // Full: the second unit isn't offered them, and says why.
    const second = viewRoster(r, all).units[1].choices.find((g) => g.where === "rules options")!;
    expect(second.choices).toEqual([]);
    expect(second.full).toBe("Drilled, Stubborn: already taken by another unit, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
    // Taken anyway (the points went down after): the unit is told.
    r = updateUnit(r, "u2", { picks: ["rules options|Stubborn"] });
    const view = viewRoster(r, all);
    const message = "Empire Knights with a special rule option: 2 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)";
    expect(view.issues.map((i) => i.message)).toContain(message);
    expect(view.issues.find((i) => i.message === message)!.units).toEqual(["u1", "u2"]);
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

  it("no General marks Characters; fewer than three units marks Core, Special, Rare", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.empire-knights", 5);
    const issues = viewRoster(r, all).issues;
    expect(issues.find((i) => i.message === "The General: 0 taken, needs 1")!.categories).toEqual(["Characters"]);
    expect(issues.find((i) => i.message === "Minimum Three Units: 1 taken, needs 3")!.categories).toEqual(["Core", "Special", "Rare"]);
  });

  it("an entry at its limit isn't offered again: Veteran State Troops 0–1 per 1,000, Generals 0–1", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    expect(viewRoster(r, all).full).toEqual({});
    r = add(r, all, "tow.unit.veteran-state-troops", 10);
    r = add(r, all, "tow.unit.general-of-the-empire");
    const full = viewRoster(r, all).full;
    expect(full["tow.unit.veteran-state-troops"]).toBe("Veteran State Troops: 1 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
    expect(full["tow.unit.grand-master"]).toBe("Generals: 1 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
    expect(full["tow.unit.state-troops"]).toBeUndefined();
  });

  it("a unit's card lists its limits with how many are taken", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.veteran-state-troops", 10);
    r = add(r, all, "tow.unit.general-of-the-empire");
    const units = viewRoster(r, all).units;
    expect(units[0].limits).toEqual(["This entry: 0–1 per 1,000 pts · 1 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)"]);
    expect(units[1].limits).toContain("Generals (General of the Empire, Grand Master): 0–1 per 1,000 pts · 1 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
  });

  it("a limits line names a setting that isn't the game's default, and where it's set", () => {
    let r = newRoster("Friday", { ...context, settings: { "Per 1,000 points": "full(target / 100)" } }, empire, 1000, all);
    const ctx = { ...context, settings: { "Per 1,000 points": "full(target / 100)" } };
    const items = all.map((i) => (i.key === ctx.key ? ctx : i));
    r = add(r, items, "tow.unit.veteran-state-troops", 10);
    expect(viewRoster(r, items).units[0].limits).toEqual(["This entry: 0–1 per 1,000 pts · 1 taken, at most 10 at 1,000 pts (0–1 per 1,000 pts) (Per 1,000 points: full(target / 100), set in this set-up)"]);
  });

  it("a Captain's Magic Items: the Empire's items, kept to 50 pts", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.captain-of-the-empire");
    const items = all.map((i) => (i.key === r.key ? r : i)).concat([r]);
    const choices = itemChoices(r, items, "u1", "options", "Magic Items");
    expect(choices.find((c) => c.item.name === "Runefang")!.why).toBe("100 pts would be over 50");
    expect(choices.find((c) => c.item.name === "Jade Amulet")!.item.extremelyCommon).toBe(true);
    expect(choices.some((c) => c.item.type === "magic standard")).toBe(false);
  });

  it("two Helblasters at 1,000 points break the army's 0–1 per 1,000", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(add(r, all, "tow.unit.helblaster-volley-gun"), all, "tow.unit.helblaster-volley-gun");
    expect(viewRoster(r, all).issues.map((i) => i.message)).toContain("Rare war machines: 2 taken, at most 1 at 1,000 pts (0–1 per 1,000 pts)");
  });

  it("the Captain inherits the General's options, with his own magic item allowance", () => {
    let r = newRoster("Friday", context, empire, 1000, all);
    r = add(r, all, "tow.unit.captain-of-the-empire");
    const u = viewRoster(r, all).units[0];
    const labels = u.choices.flatMap((g) => g.choices.map((c) => c.label));
    expect(labels).toEqual(expect.arrayContaining(["Great Weapon", "Shield", "Barded Warhorse", "Battle Standard Bearer"]));
    expect(u.choices.map((g) => g.allowance?.text).filter(Boolean)).toContain("Magic Items: up to 50 pts");
  });
});

describe("a limit's filter, read from the sheet", () => {
  const unit = { name: "Great Cannon", character: false, troopType: "War Machine", category: "Rare", rules: ["Cannon"] };
  const knight = { name: "Empire Knights", character: false, troopType: "Heavy Cavalry", category: "Core", rules: ["Swiftstride"] };
  const general = { name: "General of the Empire", character: true, troopType: "Heavy Infantry", category: "Characters", rules: [] };
  it("words: not Character; Troop Type not A,B", () => {
    const f = readFilter("not Character; Troop Type not Swarm,War Beasts,War Machine");
    expect(f.problems).toEqual([]);
    expect([unit, knight, general].map((u) => passesFilter(u, f))).toEqual([false, true, false]);
  });
  it("brackets: Not(Character);Not(Troop Type(A|B)) is the same", () => {
    const f = readFilter("Not(Character);Not(Troop Type(Swarm|War Beasts|War Machine))");
    expect([unit, knight, general].map((u) => passesFilter(u, f))).toEqual([false, true, false]);
  });
  it("other fields: Category, Unit, Rule; and an unreadable part says so", () => {
    expect(passesFilter(knight, readFilter("Category(Core,Special)"))).toBe(true);
    expect(passesFilter(knight, readFilter("Rule(Swiftstride)"))).toBe(true);
    expect(passesFilter(unit, readFilter("Unit Great Cannon,Mortar"))).toBe(true);
    expect(readFilter("Wings(2)").problems).toHaveLength(1);
  });
});
