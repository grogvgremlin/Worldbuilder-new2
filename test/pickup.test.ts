// Pick-up as a sandbox; presets; FAQs with their book; clashes on upload; backup.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Context, Equipment, Game, Item, Package, Unit } from "../src/items/items";
import { copyContext, fromPreset, readContext, switchOn } from "../src/context/context";
import { planUpload } from "../src/library/library";
import { AppData } from "../src/app/app-data";
import { MemoryStore } from "../src/store/store";
import { downloadFullYaml } from "../src/library/upload";
import { loadFolder } from "./helpers";
import { readFolder } from "./read-folder";

const { items } = loadFolder(readFolder(join(__dirname, "fixtures/tow-sample")));
const tow = items.find((i): i is Game => i.kind === "game")!;
const pkg = (key: string, extra: Partial<Package>): Package => ({ key, kind: "package", name: key, game: "tow", layer: "book", members: [], includes: [], needsStated: [], ...extra });

describe("presets", () => {
  it("TOW basic: every army in Forces of Fantasy, Standard composition; Ravening Hordes reported missing", () => {
    const preset = tow.presets!.find((p) => p.name === "TOW basic")!;
    const { context, missing } = fromPreset("Friday", tow, preset, items);
    expect(missing).toEqual(["Ravening Hordes"]);
    expect(readContext(context, items).on.has("tow.the-empire")).toBe(true);
    expect(context.composition).toEqual([{ package: "tow.standard-composition", on: true }]);
    expect(context.sandbox).toBe("pickup");
  });
  it("TOW core only: nothing but the core", () => {
    const { context } = fromPreset("x", tow, tow.presets![0], items);
    expect(context.books).toEqual([]);
  });
  it("a copy has the same set-up, a new key and name", () => {
    const { context } = fromPreset("Friday", tow, tow.presets![1], items);
    const copy = copyContext(context, [...items, context]);
    expect(copy.key).not.toBe(context.key);
    expect(copy.name).toBe("Friday (copy)");
    expect(copy.books).toEqual(context.books);
  });
});

describe("FAQs", () => {
  it("a book brings its latest FAQ", () => {
    const faqs = [pkg("tow.empire-faq-1-1", { layer: "faq", corrects: "tow.the-empire", version: "1.1" }), pkg("tow.empire-faq-1-10", { layer: "faq", corrects: "tow.the-empire", version: "1.10" }), pkg("tow.empire-faq-1-2", { layer: "faq", corrects: "tow.the-empire", version: "1.2" })];
    const all: Item[] = [...items, ...faqs];
    const { context } = fromPreset("x", tow, null, all);
    const on = switchOn(context, "tow.the-empire", all);
    expect(on.faqs).toEqual([{ package: "tow.empire-faq-1-10", on: true }]);
  });
});

describe("clashes on upload", () => {
  const hw = items.find((i): i is Equipment => i.key === "tow.equipment.hand-weapon")!;
  const orcs = pkg("tow.orcs", { name: "Orcs & Goblins", members: ["tow.equipment.hand-weapon", "tow.equipment.choppa"] });
  const choppa: Equipment = { ...hw, key: "tow.equipment.choppa", name: "Choppa", homePackage: "tow.orcs", aliases: [] };

  it("same name, same content: kept once, not a clash", () => {
    const plan = planUpload(items, [orcs, { ...hw, homePackage: "tow.orcs" }, choppa]);
    expect(plan.clashes).toEqual([]);
    expect(plan.shared.map((i) => i.key)).toEqual(["tow.equipment.hand-weapon"]);
    expect(plan.library.find((i) => i.key === "tow.equipment.hand-weapon")!.homePackage).toBe("tow.rulebook");
  });

  it("same name, different content: a clash to choose; nothing added until chosen", () => {
    const theirs: Equipment = { ...hw, homePackage: "tow.orcs", text: "Orc hand weapons are different" };
    const plan = planUpload(items, [orcs, theirs, choppa]);
    expect(plan.clashes.map((c) => c.key)).toEqual(["tow.equipment.hand-weapon"]);
    expect(plan.undecided).toBe(true);

    const keep = planUpload(items, [orcs, theirs, choppa], { "tow.equipment.hand-weapon": "existing" });
    expect(keep.library.find((i) => i.key === "tow.equipment.hand-weapon")).toMatchObject({ homePackage: "tow.rulebook" });

    const take = planUpload(items, [orcs, theirs, choppa], { "tow.equipment.hand-weapon": "new" });
    expect(take.library.find((i) => i.key === "tow.equipment.hand-weapon")).toMatchObject({ homePackage: "tow.orcs", text: "Orc hand weapons are different" });
    expect((take.library.find((i) => i.key === "tow.rulebook") as Package).members).not.toContain("tow.equipment.hand-weapon");

    const both = planUpload(items, [orcs, theirs, choppa], { "tow.equipment.hand-weapon": "both" });
    const lib = both.library;
    expect(lib.find((i) => i.key === "tow.equipment.hand-weapon")).toMatchObject({ homePackage: "tow.rulebook" });
    expect(lib.find((i) => i.key === "tow.equipment.hand-weapon.orcs")).toMatchObject({ homePackage: "tow.orcs", name: "Hand Weapon" });
    // Each book's names find their own: the Empire's units still use the rulebook's.
    const smt = lib.find((i): i is Unit => i.key === "tow.unit.state-missile-troops")!;
    expect(smt.rows[0].equipment[0].item).toBe("tow.equipment.hand-weapon");
    // Uploading the Orc book again remembers "keep both".
    const again = planUpload(lib, [orcs, theirs, choppa]);
    expect(again.undecided).toBe(false);
  });
});

describe("backup", () => {
  it("everything (library, set-ups, lists) saves to one file and restores; removing the library keeps set-ups", async () => {
    const app = new AppData(new MemoryStore());
    await app.load();
    await app.accept(planUploadDraft(app));
    const { context } = fromPreset("Friday", tow, tow.presets![1], app.items);
    await app.putItem(context);
    const file = new TextDecoder().decode(downloadFullYaml(app.everything(), "b.yaml").bytes);

    const other = new AppData(new MemoryStore());
    await other.load();
    expect(await other.restore(file)).toEqual([]);
    expect(other.items.map((i) => i.key).sort()).toEqual(app.items.map((i) => i.key).sort());

    await other.wipeLibrary();
    expect(other.items.map((i) => i.kind).sort()).toEqual(["context", "sandbox"]);
    expect((other.items.find((i) => i.kind === "context") as Context).name).toBe("Friday");
  });
});

function planUploadDraft(app: AppData) {
  return { fileNames: [], problems: [], uploaded: items, choices: {}, plan: planUpload(app.items, items) };
}

describe("items stored before race dimensions", () => {
  it("are brought up to date: race, tree, rank become a profile", async () => {
    const { upgradeItem } = await import("../src/items/race-dimensions");
    expect(upgradeItem({ key: "tow.race.human.core.base", kind: "race-profile", name: "Human · Core · Base", race: "Human", stats: {}, rules: [] })).toEqual({ key: "tow.race.human.core.base", kind: "race-profile", name: "Human · Core · Base", profile: { Race: "Human" }, stats: {}, rules: [] });
  });
});
