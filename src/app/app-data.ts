// What the screens ask of the app: the library's items, uploading (as a draft to review, then
// accepted), downloading, and wiping. Screens only show things and call these.
// Data structure: rebuild/data-structure.md §9.

import { upgradeItem, upgradeItems } from "../items/race-dimensions";
import { unitsToDifferences } from "../rules/race-deltas";
import type { Item } from "../items/items";
import { moveItem, planUpload, removeGame, removePackages, type ClashChoice, type UploadPlan } from "../library/library";
import { pickupSandbox } from "../context/context";
import { isWorldItem } from "../world/world";
import { WorldHistory } from "../world/history";
import { upgradeScopes } from "../world/places";
import { readFullYaml } from "../packages/full-yaml";
import { readUploads, type UploadFile } from "../library/upload";
import type { Problem } from "../packages/formats";
import type { Store } from "../store/store";

// An upload read and checked, waiting to be added or discarded.
export type Draft = { fileNames: string[]; problems: Problem[]; uploaded: Item[]; choices: Record<string, ClashChoice>; plan: UploadPlan };

export class AppData {
  items: Item[] = [];
  history = new WorldHistory(); // every change to a world, for Undo (owner, 28 Nov)
  openWorld: string | null = null; // the world open in World (and later Campaign): the header's switcher


  constructor(private store: Store) {}

  // Reads what's kept, and makes the permanent Pick-up sandbox if it isn't there.
  async load(): Promise<void> {
    // Items stored by an older build are brought up to date (race cells as a profile: 24 Nov).
    this.items = upgradeScopes(upgradeItems(unitsToDifferences((await this.store.listItems()).map((i) => upgradeItem(i) as Item))));
    if (!this.items.some((i) => i.kind === "sandbox" && i.key === "pickup")) {
      this.items = [...this.items, pickupSandbox()];
      await this.store.replaceItems(this.items);
    }
    this.openWorld = (await this.store.getSetting("openWorld")) ?? null;
  }

  async setOpenWorld(key: string | null): Promise<void> {
    this.openWorld = key;
    await this.store.setSetting("openWorld", key ?? "");
  }

  async readDraft(files: UploadFile[]): Promise<Draft> {
    const read = await readUploads(files, this.items);
    return { fileNames: files.map((f) => f.name), problems: read.problems, uploaded: read.items, choices: {}, plan: planUpload(this.items, read.items) };
  }

  // The same upload again, with the owner's choices for its clashes.
  choose(draft: Draft, key: string, choice: ClashChoice): Draft {
    const choices = { ...draft.choices, [key]: choice };
    return { ...draft, choices, plan: planUpload(this.items, draft.uploaded, choices) };
  }

  async accept(draft: Draft): Promise<void> {
    await this.store.replaceItems(draft.plan.library);
    this.items = draft.plan.library;
  }

  async moveItem(key: string, toPackage: string): Promise<void> {
    this.items = moveItem(this.items, key, toPackage);
    await this.store.replaceItems(this.items);
  }

  async removePackage(key: string): Promise<void> {
    this.items = removePackages(this.items, [key]);
    await this.store.replaceItems(this.items);
  }

  async removeGame(key: string): Promise<void> {
    this.items = removeGame(this.items, key);
    await this.store.replaceItems(this.items);
  }

  // Saves one item (a context, a roster), replacing any with the same key.
  // Many items changed at once (a change that runs through the library, like a renamed race dimension).
  async setItems(items: Item[]): Promise<void> {
    this.history.record(this.items, items);
    this.items = items;
    await this.store.replaceItems(this.items);
  }

  // Steps a world back (or forward again) through its history; not itself a change to record.
  async undoWorld(world: string): Promise<boolean> {
    const next = this.history.undo(this.items, world);
    if (!next) return false;
    this.items = next;
    await this.store.replaceItems(this.items);
    return true;
  }

  async redoWorld(world: string): Promise<boolean> {
    const next = this.history.redo(this.items, world);
    if (!next) return false;
    this.items = next;
    await this.store.replaceItems(this.items);
    return true;
  }

  async putItem(item: Item): Promise<void> {
    const next = [...this.items.filter((i) => i.key !== item.key), item];
    this.history.record(this.items, next);
    this.items = next;
    await this.store.replaceItems(this.items);
  }

  // Removes items by key (a roster; a pick-up game with its rosters).
  async removeItems(keys: string[]): Promise<void> {
    const gone = new Set(keys);
    const next = this.items.filter((i) => !gone.has(i.key));
    this.history.record(this.items, next);
    this.items = next;
    await this.store.replaceItems(this.items);
  }

  // Everything on the device as one file (library, pick-up contexts, lists): a backup, or a move
  // to another device.
  everything(): Item[] {
    return this.items;
  }

  // Replaces everything on the device with a backup file. Problems mean nothing was changed.
  async restore(text: string): Promise<string[]> {
    const read = readFullYaml(text);
    if (read.problems.length) return read.problems;
    if (read.items.length === 0) return ["the file holds nothing"];
    this.items = read.items;
    if (!this.items.some((i) => i.kind === "sandbox" && i.key === "pickup")) this.items.push(pickupSandbox());
    await this.store.replaceItems(this.items);
    return [];
  }

  // Removes the library (games, books, packages) but keeps pick-up contexts, lists and worlds.
  async wipeLibrary(): Promise<void> {
    this.items = this.items.filter((i) => i.kind === "context" || i.kind === "roster" || i.kind === "sandbox" || isWorldItem(i));
    await this.store.replaceItems(this.items);
  }

  // Removes everything on the device.
  async wipe(): Promise<void> {
    this.items = [pickupSandbox()];
    await this.store.replaceItems(this.items);
  }
}
