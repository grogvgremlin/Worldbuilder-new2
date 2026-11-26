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
// The database is "worldbuilder-app", not "worldbuilder": every app under grogvgremlin.github.io
// shares one set of databases, and the archived first build used "worldbuilder" with stores of its
// own ("log" and "content", later "logs", "items" by [space, key] …). A browser that once ran it
// had a "worldbuilder" this app couldn't use, and the app stopped on a blank page (owner, 26 Nov:
// "'items' is not a known object store name").
export const DATABASE = "worldbuilder-app";
const EARLIER = "worldbuilder"; // where this app kept its data before 26 Nov

export class IndexedDbStore implements Store {
  private constructor(private db: IDBDatabase) {}

  static open(name = DATABASE, factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
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

  // The app's database, with what this app kept in "worldbuilder" before 26 Nov copied in the first
  // time (only when that database holds this app's own shape of data; the archived build's is left
  // alone). The earlier database is never changed or deleted.
  static async openForApp(factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
    const store = await IndexedDbStore.open(DATABASE, factory);
    if ((await store.getSetting("copiedFromEarlier")) !== undefined) return store;
    const earlier = await readEarlier(factory);
    if (earlier && (await store.listItems()).length === 0) {
      await store.replaceItems(earlier.items);
      for (const [name, value] of earlier.settings) await store.setSetting(name, value);
    }
    await store.setSetting("copiedFromEarlier", earlier ? "yes" : "nothing to copy");
    return store;
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

// What this app kept in the earlier "worldbuilder" database, if that database is this app's (an
// "items" store keyed by "key", and "settings"); otherwise nothing. Never creates the database: if
// it doesn't exist, the open is stopped before it's made.
async function readEarlier(factory: IDBFactory): Promise<{ items: Item[]; settings: [string, string][] } | null> {
  // Where the browser can list its databases, don't open one that isn't there.
  if (factory.databases) {
    const names = (await factory.databases().catch(() => [])).map((d) => d.name);
    if (!names.includes(EARLIER)) return null;
  }
  return new Promise((resolve) => {
    const request = factory.open(EARLIER);
    request.onupgradeneeded = () => request.transaction?.abort(); // it didn't exist: don't make it
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const ours = db.objectStoreNames.contains("items") && db.objectStoreNames.contains("settings") && db.transaction("items").objectStore("items").keyPath === "key";
      if (!ours) {
        db.close();
        return resolve(null);
      }
      const tx = db.transaction(["items", "settings"], "readonly");
      const items = tx.objectStore("items").getAll();
      const keys = tx.objectStore("settings").getAllKeys();
      const values = tx.objectStore("settings").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve({ items: items.result as Item[], settings: (keys.result as string[]).map((k, n) => [k, values.result[n] as string]) });
      };
      tx.onerror = () => (db.close(), resolve(null));
    };
  });
}

// Asks the browser not to clear the data when space runs low (iOS clears unused sites otherwise).
export async function askForPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || (await navigator.storage.persist());
}
