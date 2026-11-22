// Editing a game's configuration in the app (owner, 22 Nov: "it all needs to be in app"): its core,
// default composition, presets and settings. Each change returns a new game record; it downloads with
// the game (game.yaml), so the files can catch up from the app.
//
// Pure.

import type { Context, Game, GamePreset, GameSetting, Item, Package } from "../items/items";
import { isCompositionSet } from "../library/package-types";

// A preset from a set-up as it stands: its books, FAQs, house rules, composition and settings, by name.
export function presetFromContext(context: Context, items: Item[], name: string): GamePreset {
  const nameOf = (key: string) => items.find((i) => i.key === key)?.name ?? key;
  const on = (list: { package: string; on: boolean }[]) => list.filter((p) => p.on).map((p) => nameOf(p.package));
  const preset: GamePreset = { name };
  if (context.books.some((p) => p.on)) preset.books = on(context.books);
  if (context.faqs.some((p) => p.on)) preset.faqs = on(context.faqs);
  if (context.house.some((p) => p.on)) preset.house = on(context.house);
  preset.composition = on(context.composition);
  if (context.settings && Object.keys(context.settings).length) preset.settings = { ...context.settings };
  return preset;
}

export function withPreset(game: Game, index: number, preset: GamePreset | null): Game {
  const presets = [...(game.presets ?? [])];
  if (preset === null) presets.splice(index, 1);
  else if (index >= presets.length) presets.push(preset);
  else presets[index] = preset;
  return { ...game, presets };
}

export function movePreset(game: Game, index: number, by: -1 | 1): Game {
  const presets = [...(game.presets ?? [])];
  const to = index + by;
  if (to < 0 || to >= presets.length) return game;
  [presets[index], presets[to]] = [presets[to], presets[index]];
  return { ...game, presets };
}

export function withSetting(game: Game, index: number, setting: GameSetting | null): Game {
  const settings = [...(game.settings ?? [])];
  if (setting === null) settings.splice(index, 1);
  else if (index >= settings.length) settings.push(setting);
  else settings[index] = setting;
  return { ...game, settings };
}

// The packages a game's configuration can name: its own, not the app's stubs.
export function gamePackages(game: Game, items: Item[]): Package[] {
  return items.filter((i): i is Package => i.kind === "package" && i.game === game.shortName && !i.stubsFor);
}

export function compositionSets(game: Game, items: Item[]): Package[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return gamePackages(game, items).filter((p) => isCompositionSet(p, byKey));
}
