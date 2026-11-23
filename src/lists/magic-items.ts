// Magic items on a roster: what an allowance offers, what's been picked, and the rules about them.
// An allowance is an option written with a budget: "Magic Items(;0-50 total)", "+Magic Standard
// (replace~Standard;0-50 total;0-1)". The allowance's own row (Type "allowance" on an equipment tab)
// says which types it takes, as Only(magic weapon|talisman …); with none, the type of the same name.
// The rules about magic items are limits in the data (a Composition tab), not code (owner, 23 Nov):
//   magic weapon~0-1~bearer            one magic weapon per bearer (any type name works the same)
//   each magic item[not Extremely Common]~0-1~army   each item once per army, unless extremely common
// "bearer" counts per character or command model holding the allowance; "army" across the list.
// Design: design/options-items-and-rules.md (items taken through allowances; budgets).
//
// Pure.

import type { CompositionRule, Item, Limit, MagicItem } from "../items/items";
import { matchName } from "../items/keys";
import { splitTop } from "../notation/split";

// A pick: "item:<where>|<allowance>|<item key>", e.g. "item:slot:Count's Champion|Magic Items|tow.magic-item.runefang".
export function itemPick(where: string, allowance: string, itemKey: string): string {
  return `item:${where}|${allowance}|${itemKey}`;
}

export type ItemPick = { where: string; allowance: string; itemKey: string };

export function readItemPick(pick: string): ItemPick | null {
  if (!pick.startsWith("item:")) return null;
  const [where, allowance, itemKey] = pick.slice(5).split("|");
  return where && allowance && itemKey ? { where, allowance, itemKey } : null;
}

// The types an allowance takes: from its row's Only(...), or the type named like it.
export function allowanceTypes(allowance: string, reach: Item[]): string[] {
  const row = reach.find((i) => i.kind === "equipment" && matchName(i.name) === matchName(allowance) && i.type === "allowance");
  const only = row?.kind === "equipment" ? row.rules.find((t) => /^only$/i.test(t.name))?.detail : undefined;
  return only ? only.split(/[|,]/).map((t) => t.trim()).filter(Boolean) : [allowance];
}

// What a bearer is, for an item's Only(...): its name, rules and troop type.
export type Bearer = { name: string; rules: string[]; troopType?: string };

// Why a bearer can't take an item, or null. Only(X) names a unit, a rule or a troop type the bearer
// must have; "Only(1 per Wizard)"-style counts aren't checked yet.
export function notForBearer(item: MagicItem, bearer: Bearer): string | null {
  for (const t of item.rules.filter((r) => /^only$/i.test(r.name) && r.detail && !/^\d+\s+per\b/i.test(r.detail))) {
    const wanted = t.detail!.split(/[|,]/).map((w) => matchName(w.trim()));
    const has = [bearer.name, ...bearer.rules, bearer.troopType ?? ""].some((x) => wanted.includes(matchName(x)));
    if (!has) return `only for ${t.detail}`;
  }
  return null;
}

// The magic items an allowance offers, in reach, of its types.
export function itemsForAllowance(allowance: string, reach: Item[]): MagicItem[] {
  const types = allowanceTypes(allowance, reach).map(matchName);
  const typeOk = (type: string) => types.includes(matchName(type)) || types.includes(matchName(type) + "s");
  return reach.filter((i): i is MagicItem => i.kind === "magic-item" && typeOk(i.type));
}

// --- The rules about magic items ------------------------------------------------------------------

export type PickedItem = { unitId: string; bearer: string; item: MagicItem };

// Does a limit count magic items? "magic item", "each magic item", or a type name ("talisman").
export function countsItems(limit: Limit, types: Set<string>): boolean {
  const what = matchName(limit.counts.replace(/^each\s+/i, ""));
  return what === "magic item" || what === "magic items" || types.has(what);
}

// The issues the magic-item limits find in what's picked: [message, unit ids].
export function itemRuleIssues(picked: PickedItem[], rules: CompositionRule[]): { message: string; units: string[] }[] {
  const types = new Set(picked.map((p) => matchName(p.item.type)));
  const out: { message: string; units: string[] }[] = [];
  for (const rule of rules)
    for (const limit of rule.limits.limits) {
      if (!countsItems(limit, types)) continue;
      const what = matchName(limit.counts.replace(/^each\s+/i, ""));
      const each = /^each\s+/i.test(limit.counts);
      const these = picked.filter((p) => (what === "magic item" || what === "magic items" || matchName(p.item.type) === what) && itemPasses(p.item, limit.where));
      const perBearer = matchName(limit.basis ?? "") === "bearer";
      const groups = new Map<string, PickedItem[]>();
      for (const p of these) {
        const key = (perBearer ? p.bearer : "army") + (each ? `|${p.item.key}` : "");
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      const max = limit.amount.max;
      if (max === null) continue;
      for (const list of groups.values()) {
        if (list.length <= max) continue;
        const label = each ? list[0].item.name : limit.counts;
        out.push({ message: `${rule.name}: ${label} ${list.length} taken${perBearer ? " by one bearer" : ""}, at most ${max}`, units: [...new Set(list.map((p) => p.unitId))] });
      }
    }
  return out;
}

// The filter in a magic-item limit's brackets: "not Extremely Common", "Type(talisman)".
function itemPasses(item: MagicItem, where: string | undefined): boolean {
  for (const part of splitTop(where ?? "", ";").map((p) => p.trim()).filter(Boolean)) {
    const not = /^not\s+/i.test(part);
    const body = part.replace(/^not\s+/i, "");
    let holds = true;
    if (/^extremely common$/i.test(body)) holds = item.extremelyCommon;
    const type = /^type\s*\((.*)\)$/i.exec(body);
    if (type) holds = type[1].split(/[|,]/).some((t) => matchName(t) === matchName(item.type));
    if (holds === not) return false;
  }
  return true;
}
