// What the screens ask of the app: the library's items, uploading (as a draft to review, then
// accepted), downloading, and wiping. Screens only show things and call these.
// Data structure: rebuild/data-structure.md §9.

import type { Item } from "../items/items";
import { moveItem, planUpload, removeGame, removePackages, type UploadPlan } from "../library/library";
import { readUploads, type UploadFile } from "../library/upload";
import type { Problem } from "../packages/formats";
import type { Store } from "../store/store";

// An upload read and checked, waiting to be added or discarded.
export type Draft = { fileNames: string[]; problems: Problem[]; plan: UploadPlan };

export class AppData {
  items: Item[] = [];

  constructor(private store: Store) {}

  async load(): Promise<void> {
    this.items = await this.store.listItems();
  }

  async readDraft(files: UploadFile[]): Promise<Draft> {
    const read = await readUploads(files, this.items);
    return { fileNames: files.map((f) => f.name), problems: read.problems, plan: planUpload(this.items, read.items) };
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

  async wipe(): Promise<void> {
    await this.store.replaceItems([]);
    this.items = [];
  }
}
