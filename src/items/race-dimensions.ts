// The race grid's dimensions, and placing a profile in it. A game declares its dimensions (Race,
// Tree, Rank by default); a profile's key and name come from its values, blanks filled in.
// Data structure: rebuild/data-structure.md (races); owner, 23 Nov (dimensions configurable).

import type { Game, Item, RaceDimension } from "./items";
import { itemKey } from "./keys";
import { renameAgainst } from "../rules/race-deltas";

export const DEFAULT_DIMENSIONS: RaceDimension[] = [{ name: "Race" }, { name: "Tree", blank: "Core" }, { name: "Rank", blank: "Base" }];

export function dimensionsOf(game: Game | undefined): RaceDimension[] {
  return game?.raceDimensions?.length ? game.raceDimensions : DEFAULT_DIMENSIONS;
}

// The game an item belongs to, from its key's first part (tow.race.… -> tow).
export function gameOf(itemKeyText: string, items: Item[]): Game | undefined {
  const short = itemKeyText.split(".")[0];
  return items.find((i): i is Game => i.kind === "game" && i.shortName === short);
}

// Each dimension's value, blanks filled: ["Human", "Core", "Base"].
export function placeIn(profile: Record<string, string>, dims: RaceDimension[]): string[] {
  return dims.map((d) => profile[d.name] || d.blank || "");
}

export function profileKey(game: string, profile: Record<string, string>, dims: RaceDimension[]): string {
  return itemKey(game, "race-profile", ...placeIn(profile, dims));
}

export function profileName(profile: Record<string, string>, dims: RaceDimension[]): string {
  return placeIn(profile, dims).filter(Boolean).join(" · ");
}

// Converts a profile stored before dimensions were configurable (race, tree, rank fields).
export function upgradeItem(item: Record<string, any>): Record<string, any> {
  const old = (o: Record<string, any>) => {
    const profile: Record<string, string> = {};
    if (o.race) profile["Race"] = o.race;
    if (o.tree) profile["Tree"] = o.tree;
    if (o.rank) profile["Rank"] = o.rank;
    const { race, tree, rank, ...rest } = o;
    return { rest, profile };
  };
  // A link from before 27 Nov evening: part of one item (a key), now of several (a list).
  if (item.kind === "link" && typeof item.partOf === "string") return { ...item, partOf: [item.partOf] };
  // A link kind from before 26 Nov with lists per end: those ends differ (one list or the other now).
  if (item.kind === "link-kind" && item.endsDiffer === undefined && (item.expectsFrom?.length || item.expectsTo?.length) && !item.scope?.length) {
    return { ...item, endsDiffer: true };
  }
  if (item.kind === "roster" && "battle" in item) {
    const { battle, ...rest } = item; // battle marks from a short-lived build (24 Nov): battles come with the Battle tool
    return rest;
  }
  if (item.kind === "race-profile" && !item.profile) {
    const { rest, profile } = old(item);
    return { ...rest, profile };
  }
  if (item.kind === "unit" && item.rows.some((r: any) => r.race || r.tree || r.rank))
    return { ...item, rows: item.rows.map((r: any) => (r.race || r.tree || r.rank ? (({ rest, profile }) => ({ ...rest, profile }))(old(r)) : r)) };
  return item;
}

// Link containers became a container kind (owner, 27 Nov): a connection kind's "its links can be part
// of" becomes a link container kind holding those links in items of those kinds; a world with links
// already part of something that no link container kind covers gets one that takes anything.
function upgradeLinkContainers(items: Item[]): Item[] {
  const out: Item[] = [];
  const made: Item[] = [];
  for (const i of items) {
    if (i.kind === "link-kind" && i.partOfTakes !== undefined) {
      const { partOfTakes, ...rest } = i;
      out.push(rest);
      if (partOfTakes.length) made.push({ key: freeKey(items, `${i.world}.link-kind.made-of-${i.key.split(".").pop()}`), kind: "link-kind", world: i.world, name: `made of ${i.name}`, reverseName: "part of", direction: "one-way", hierarchy: "links", endsDiffer: true, expectsFrom: [i.key], expectsTo: partOfTakes, strictness: i.strictness });
    } else out.push(i);
  }
  const all = [...out, ...made];
  const worlds = new Set(all.filter((i) => i.kind === "link" && i.partOf?.length).map((i) => (i as { world: string }).world));
  for (const world of worlds) {
    if (all.some((i) => i.kind === "link-kind" && i.world === world && i.hierarchy === "links")) continue;
    all.push({ key: freeKey(all, `${world}.link-kind.made-of-links`), kind: "link-kind", world, name: "made of links", reverseName: "part of", direction: "one-way", hierarchy: "links" });
  }
  return all;
}

function freeKey(items: Item[], base: string): string {
  const taken = new Set(items.map((i) => i.key));
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}

// Upgrades that need more than the item itself. A link's single value (27 Nov, one day) becomes a
// field named as its link kind named it ("Distance"); the link kind's "carries a value" becomes that
// field, offered on its links.
export function upgradeItems(items: Item[]): Item[] {
  return upgradeLinkContainers(upgradeLinkValues(items));
}

function upgradeLinkValues(items: Item[]): Item[] {
  const named = new Map<string, string>();
  for (const i of items) if (i.kind === "link-kind" && i.carries === "value") named.set(i.key, i.valueName || "value");
  return items.map((i) => {
    if (i.kind === "link-kind" && (i.carries !== undefined || i.valueName !== undefined)) {
      const { carries, valueName, ...rest } = i;
      const field = carries === "value" ? valueName || "value" : null;
      const fields = field && !(rest.fields ?? []).some((f) => f.name === field) ? [...(rest.fields ?? []), { name: field }] : rest.fields;
      return { ...rest, ...(fields ? { fields } : {}) };
    }
    if (i.kind === "link" && i.value !== undefined) {
      const { value, ...rest } = i;
      if (!value) return rest;
      return { ...rest, fields: [...(rest.fields ?? []), { field: named.get(i.linkKind) ?? "value", value }] };
    }
    return i;
  });
}

// --- Changing the dimensions, applied at once (owner, 24 Nov: "adjust the app on the fly") ---------

export type DimensionChange = { dims: RaceDimension[]; renames: Record<string, string> }; // renames: old name -> new

// The game with its new dimensions, and every race profile and unit of that game brought into line:
// renamed dimensions renamed in each profile; every profile keyed and named again; packages listing
// them updated. Values of a removed dimension are kept in the profile, unused. If two profiles would
// end up the same (a dimension removed that told them apart), nothing changes and that's said.
export function changeDimensions(items: Item[], game: Game, change: DimensionChange): { items: Item[]; problems: string[] } {
  const rename = (profile: Record<string, string>) => Object.fromEntries(Object.entries(profile).map(([k, v]) => [change.renames[k] ?? k, v]));
  const inGame = (i: Item) => i.key.split(".")[0] === game.shortName;
  const newKeys = new Map<string, string>();
  const seen = new Map<string, string>();
  const problems: string[] = [];
  const out = items.map((i) => {
    if (i.kind === "game" && i.key === game.key) return { ...i, raceDimensions: change.dims };
    if (i.kind === "race-profile" && inGame(i)) {
      const profile = rename(i.profile);
      const key = profileKey(game.shortName, profile, change.dims);
      if (seen.has(key)) problems.push(`${seen.get(key)} and ${i.name} would become the same profile (${key})`);
      seen.set(key, i.name);
      newKeys.set(i.key, key);
      return { ...i, profile, key, name: profileName(profile, change.dims) };
    }
    if (i.kind === "unit" && inGame(i) && i.rows.some((r) => r.profile))
      return { ...i, rows: i.rows.map((r) => (r.profile ? { ...r, profile: rename(r.profile) } : r)) };
    return i;
  });
  if (problems.length) return { items, problems };
  return {
    items: out.map((i) => (i.kind === "package" ? { ...i, members: i.members.map((k) => newKeys.get(k) ?? k) } : renameAgainst(i, newKeys))),
    problems,
  };
}

// A column's heading as shown: the game's own name for it, or the column's name (owner, 24 Nov).
export function headingFor(game: Game | undefined, column: string): string {
  return game?.headings?.[column] || column;
}
