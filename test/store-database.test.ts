// The app's own database (owner, 26 Nov: a blank page from "'items' is not a known object store
// name"): the archived first build used the same database name, "worldbuilder", for its own stores.
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { DATABASE, IndexedDbStore } from "../src/store/store";
import type { Item } from "../src/items/items";

const item: Item = { key: "pickup", kind: "sandbox", name: "Pick-up", world: false, permanent: true };

// Makes a database with the given version and stores, as an earlier build left it.
function makeDatabase(factory: IDBFactory, name: string, version: number, make: (db: IDBDatabase) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => make(request.result);
    request.onsuccess = () => (request.result.close(), resolve());
    request.onerror = () => reject(request.error);
  });
}

function databaseNames(factory: IDBFactory): Promise<string[]> {
  return factory.databases().then((list) => list.map((d) => d.name!));
}

describe("the app's database", () => {
  it("starts empty in a browser that has nothing, and makes no 'worldbuilder' database", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStore.openForApp(factory);
    expect(await store.listItems()).toEqual([]);
    expect(await databaseNames(factory)).toEqual([DATABASE]);
  });

  it("starts in a browser where the archived build left its 'worldbuilder' (the blank-page case)", async () => {
    const factory = new IDBFactory();
    await makeDatabase(factory, "worldbuilder", 1, (db) => {
      db.createObjectStore("log", { autoIncrement: true });
      db.createObjectStore("content");
    });
    const store = await IndexedDbStore.openForApp(factory);
    expect(await store.listItems()).toEqual([]);
    await store.replaceItems([item]);
    expect(await store.listItems()).toEqual([item]);
  });

  it("copies this app's data from 'worldbuilder' the first time, and leaves the original", async () => {
    const factory = new IDBFactory();
    const earlier = await IndexedDbStore.open("worldbuilder", factory);
    await earlier.replaceItems([item]);
    await earlier.setSetting("openWorld", "nuln");
    const store = await IndexedDbStore.openForApp(factory);
    expect(await store.listItems()).toEqual([item]);
    expect(await store.getSetting("openWorld")).toBe("nuln");
    expect(await earlier.listItems()).toEqual([item]); // the original is untouched
  });

  it("copies only once: later changes aren't overwritten by the earlier copy", async () => {
    const factory = new IDBFactory();
    const earlier = await IndexedDbStore.open("worldbuilder", factory);
    await earlier.replaceItems([item]);
    const first = await IndexedDbStore.openForApp(factory);
    await first.replaceItems([]);
    const again = await IndexedDbStore.openForApp(factory);
    expect(await again.listItems()).toEqual([]);
  });
});
