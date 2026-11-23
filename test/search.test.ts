// Search as you type: names first, then aliases, types and keys.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { search } from "../src/library/search";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const names = (q: string) => search(items, q).map((f) => f.item.name);

describe("search", () => {
  it("a name that starts with it comes first", () => {
    expect(names("hand")[0]).toBe("Hand Weapon");
    expect(names("hand")).toContain("Handgun");
  });
  it("finds by type: talisman", () => {
    expect(names("talisman")).toEqual(["Sample Charm", "Sample Ring"]);
  });
  it("finds by what it counts as, and by key", () => {
    expect(search(items, "tow.magic-item.sample-bl")[0].item.name).toBe("Sample Blade");
    expect(search(items, "shield").map((f) => [f.item.name, f.how])).toContainEqual(["Sample Shield", "name"]);
  });
  it("nothing typed, nothing found", () => {
    expect(search(items, "  ")).toEqual([]);
  });
});
