// Two books in one upload: the same name with different content is kept twice, each book using its
// own; a name both books use but neither enters is stubbed once, whatever order they arrive in.
// (Found with the Dwarfs, 28 Nov: their Gyrocopter's Steam Gun and the Empire's Steam Tank's.)
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Equipment, Item, Package, Unit } from "../src/items/items";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const sample = readFolder(join(__dirname, "fixtures/tow-sample"));
const EQUIPMENT = "Equipment,Match Key,M,WS,BS,S,T,W,I,A,Ld,Save,Rules,Alias,Rules 2,Type,R,AP,Cost,Reference\n";
const UNITS = sample["forces-of-fantasy/the-empire/units.csv"].split("\n")[0] + "\n";

// A made-up second book: one piece of kit named like one of the Empire's, and a rule nobody enters.
function withSecondBook(files: Record<string, string>): Record<string, string> {
  const columns = UNITS.trim().split(",");
  const row = Object.fromEntries(columns.map((c) => [c, ""]));
  Object.assign(row, { Package: "Forces of Fantasy", SubPackage: "Second Book", "Rule Type": "Army List", Unit: "Test Gunners", Type: "Unit", Name: "Gunner", Tier: "Core", Cost: "10~pi", Equipment: "Great Weapon", "Min/Max": "5-", Rules: "Unentered Rule", Race: "Human" });
  return {
    ...files,
    "forces-of-fantasy/a-second-book/package.yaml": "package: Second Book\ngame: tow\nlayer: book\npart of: Forces of Fantasy\nneeds: [Forces of Fantasy]\n",
    "forces-of-fantasy/a-second-book/equipment.csv": EQUIPMENT + "Great Weapon,,,,,+3,,,,,,,,,a different great weapon,hand weapon,,,,Second Book;1\n",
    "forces-of-fantasy/a-second-book/units.csv": UNITS + columns.map((c) => row[c]).join(",") + "\n",
  };
}

describe("two books with the same name", () => {
  const empire = readFolder(join(__dirname, "fixtures/tow-sample"));
  const files = withSecondBook(empire);
  const { items, problems } = loadFolder(files);
  const greatWeapons = items.filter((i): i is Equipment => i.kind === "equipment" && i.name === "Great Weapon");

  it("keeps both, the later book's copy under a key of its own", () => {
    expect(problems).toEqual([]);
    expect(greatWeapons.map((g) => g.key).sort()).toEqual(["tow.equipment.great-weapon", "tow.equipment.great-weapon.a-second-book"]);
    const second = items.find((i): i is Package => i.key === "tow.a-second-book")!;
    expect(second.members).toContain("tow.equipment.great-weapon.a-second-book");
  });

  it("lets each book's names find its own copy", () => {
    const gunners = items.find((i): i is Unit => i.kind === "unit" && i.name === "Test Gunners")!;
    expect(gunners.rows[0].equipment[0].item).toBe("tow.equipment.great-weapon.a-second-book");
  });

  it("stubs a shared unentered name in the same book whatever the order", () => {
    const home = (all: Item[]) => all.find((i) => i.name === "Unentered Rule")!.homePackage;
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    expect(home(loadFolder(reversed).items)).toBe(home(items));
  });
});
