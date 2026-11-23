// Settings: what can be changed for a game or a list without code (owner, 22 Nov).
// The game declares each setting (name, default, choices for a dropdown). Its value comes from the most
// specific place that sets it: this list → this pick-up game → the packages switched on (a later one
// over an earlier, so house rules over books) → the game's default. Design: spec/foundations/order.md
// (nearest own declaration wins); design/manifest.md §2–3 (rounding is the game's, not code's).
//
// The scaling shorthand, for limits such as "0–1 per 1,000 points":
//   full(target / 1000)            full thousands: 2,500 → 2
//   started(target / 1000)         a started thousand counts: 2,100 → 3
//   nearest(target / 1000)         2,500 → 3, 2,400 → 2
//   scale(target / 2000, down)     the range itself in proportion, each end rounded (down, up, nearest)
// Inside the brackets: numbers, "target" (the points target), + − × / and brackets.
//
// Pure.

import type { Context, Game, Item, Roster, SettingValue } from "../items/items";
import { readContext } from "../context/context";

export type Found = { value: string; from: string };

export function settingValue(name: string, game: Game | undefined, items: Item[], context?: Context, roster?: Roster): Found | null {
  if (roster?.settings?.[name] !== undefined) return { value: roster.settings[name], from: "this list" };
  if (context?.settings?.[name] !== undefined) return { value: context.settings[name], from: "this set-up" };
  if (context) {
    const order = readContext(context, items).packages.filter((p) => p.on);
    for (const p of [...order].reverse()) {
      const set = items.find((i): i is SettingValue => i.kind === "setting" && i.homePackage === p.key && i.setting === name);
      if (set) return { value: set.value, from: p.name };
    }
  }
  const declared = game?.settings?.find((s) => s.name === name);
  return declared ? { value: declared.default, from: "the game's default" } : null;
}

// --- The scaling shorthand ------------------------------------------------------------------------

export type Range = { min: number | null; max: number | null };

// Applies a scaling to a limit's range at a points target, or says why it can't.
export function applyScaling(value: string, target: number, range: Range): Range | { error: string } {
  const m = /^\s*(full|started|nearest|scale)\s*\((.*)\)\s*$/i.exec(value);
  if (!m) return { error: `can't read “${value}” (e.g. full(target / 1000))` };
  const [exprText, modeText] = splitLastComma(m[2]);
  const x = evaluate(exprText, target);
  if (typeof x !== "number") return x;
  const how = m[1].toLowerCase();
  if (how === "scale") {
    const round = rounding((modeText ?? "down").trim());
    if (!round) return { error: `round “${modeText}”: down, up or nearest` };
    return { min: range.min === null ? null : round(range.min * x), max: range.max === null ? null : round(range.max * x) };
  }
  const times = how === "full" ? Math.floor(x) : how === "started" ? Math.ceil(x) : Math.round(x);
  return { min: range.min === null ? null : range.min * times, max: range.max === null ? null : range.max * times };
}

function rounding(mode: string): ((n: number) => number) | null {
  if (/^down$/i.test(mode)) return (n) => Math.floor(n + 1e-9);
  if (/^up$/i.test(mode)) return (n) => Math.ceil(n - 1e-9) + 0; // + 0 turns -0 into 0
  if (/^nearest$/i.test(mode)) return (n) => Math.round(n);
  return null;
}

function splitLastComma(text: string): [string, string | undefined] {
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    if (text[i] === "(") depth--;
    if (text[i] === "," && depth === 0) return [text.slice(0, i), text.slice(i + 1)];
  }
  return [text, undefined];
}

// A small arithmetic reader: numbers, "target", + - * / and brackets. "×" and "÷" are accepted too.
export function evaluate(text: string, target: number): number | { error: string } {
  const tokens = text.replace(/×/g, "*").replace(/÷/g, "/").replace(/,(?=\d{3})/g, "").match(/\d+(\.\d+)?|target|[-+*/()]/gi);
  if (!tokens || tokens.join("") !== text.replace(/×/g, "*").replace(/÷/g, "/").replace(/,(?=\d{3})/g, "").replace(/\s+/g, "")) return { error: `can't read “${text.trim()}”` };
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];
  const primary = (): number => {
    const t = next();
    if (t === "(") {
      const v = sum();
      next();
      return v;
    }
    if (t === "-") return -primary();
    if (t?.toLowerCase() === "target") return target;
    return Number(t);
  };
  const product = (): number => {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * primary() : v / primary();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + product() : v - product();
    return v;
  };
  const v = sum();
  return Number.isFinite(v) && at === tokens.length ? v : { error: `can't read “${text.trim()}”` };
}

// The setting a limit's "per" part points at: "1000 roster target" → "Per 1,000 points"; a name
// written instead ("Per started 1,000") is that setting.
export function settingForLimit(perPoints: number | undefined, basis: string | undefined): string | null {
  if (perPoints) return `Per ${perPoints.toLocaleString("en-GB")} points`;
  if (basis && !/^(army|roster target)$/i.test(basis)) return basis;
  return null;
}
