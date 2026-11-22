// The storage seam: the one way the app reads and writes what's kept on the device.
// Two versions behave the same: IndexedDB on the device, and in memory for tests.
// Kept: the library's items (each a plain record) and a few settings. Nothing else is stored;
// everything shown is worked out from the items.

import type { Item } from "../items/items";

export interface Store {
  listItems(): Promise<Item[]>;
  // Replaces the whole library in one go, so a failed save can't leave half of it.
  replaceItems(items: Item[]): Promise<void>;
  getSetting(name: string): Promise<string | undefined>;
  setSetting(name: string, value: string): Promise<void>;
}

export class MemoryStore implements Store {
  private items: Item[] = [];
  private settings = new Map<string, string>();
  async listItems() {
    return structuredClone(this.items);
  }
  async replaceItems(items: Item[]) {
    this.items = structuredClone(items);
  }
  async getSetting(name: string) {
    return this.settings.get(name);
  }
  async setSetting(name: string, value: string) {
    this.settings.set(name, value);
  }
}

// IndexedDB: two object stores, "items" (by key) and "settings".
export class IndexedDbStore implements Store {
  private constructor(private db: IDBDatabase) {}

  static open(name = "worldbuilder", factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("items", { keyPath: "key" });
        request.result.createObjectStore("settings");
      };
      request.onsuccess = () => resolve(new IndexedDbStore(request.result));
      request.onerror = () => reject(request.error);
    });
  }

  listItems(): Promise<Item[]> {
    return this.run("items", "readonly", (s) => s.getAll()) as Promise<Item[]>;
  }

  replaceItems(items: Item[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      store.clear();
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSetting(name: string): Promise<string | undefined> {
    return (await this.run("settings", "readonly", (s) => s.get(name))) as string | undefined;
  }

  async setSetting(name: string, value: string): Promise<void> {
    await this.run("settings", "readwrite", (s) => s.put(value, name));
  }

  private run(storeName: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = action(this.db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Asks the browser not to clear the data when space runs low (iOS clears unused sites otherwise).
export async function askForPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || (await navigator.storage.persist());
}
