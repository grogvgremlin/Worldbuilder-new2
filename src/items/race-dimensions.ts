// The race grid's dimensions, and placing a profile in it. A game declares its dimensions (Race,
// Tree, Rank by default); a profile's key and name come from its values, blanks filled in.
// Data structure: rebuild/data-structure.md (races); owner, 23 Nov (dimensions configurable).

import type { Game, Item, RaceDimension } from "./items";
import { itemKey } from "./keys";

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
  if (item.kind === "race-profile" && !item.profile) {
    const { rest, profile } = old(item);
    return { ...rest, profile };
  }
  if (item.kind === "unit" && item.rows.some((r: any) => r.race || r.tree || r.rank))
    return { ...item, rows: item.rows.map((r: any) => (r.race || r.tree || r.rank ? (({ rest, profile }) => ({ ...rest, profile }))(old(r)) : r)) };
  return item;
}
