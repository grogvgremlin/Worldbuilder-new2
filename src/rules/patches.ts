// Patches in play in a context, and what they do to the things they change.
// A patch is a named change written in the entry columns (src/packages/patch-tabs.ts). Patches apply
// in sequence: packages in the context's applied order, then each patch's place in its package. A
// patch named in an applied patch's "Switches off" is skipped; so is one switched off in the set-up.
// Design: design/rules-overlay.md (rules apply in order, later wins); owner, 23 Nov (single layer, no
// cascades; each patch like a rule card, takeable or skippable).
//
// Pure: worked out on every read.

import type { CompositionRule, Context, Cost, Equipment, Item, OptionGroup, Options, Patch, PatchChange, SpecialRule, Stat, Stats, Term } from "../items/items";
import { matchName } from "../items/keys";
import { readContext } from "../context/context";
import { changeText } from "../packages/patch-tabs";

export type PatchInPlay = { patch: Patch; package: string };
export type PatchesInPlay = {
  applied: Patch[]; // in the order they apply
  skipped: { patch: Patch; why: string }[];
  problems: string[]; // a patch naming something that isn't in reach
};

// Every patch in a package switched on, in order, less those switched off.
export function patchesInPlay(context: Context, items: Item[]): PatchesInPlay {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const off = new Set(context.off ?? []);
  const listed: Patch[] = [];
  const skipped: PatchesInPlay["skipped"] = [];
  for (const p of readContext(context, items).packages) {
    if (!p.on) continue;
    const pkg = byKey.get(p.key);
    if (pkg?.kind !== "package") continue;
    for (const key of pkg.members) {
      const patch = byKey.get(key);
      if (patch?.kind !== "patch") continue;
      if (off.has(key)) skipped.push({ patch, why: "switched off here" });
      else listed.push(patch);
    }
  }
  // "Switches off": a patch that's on takes the ones it names out.
  const switchedBy = new Map<string, string>();
  for (const patch of listed) for (const name of patch.switchesOff) switchedBy.set(matchName(name), patch.name);
  const applied = listed.filter((p) => !switchedBy.has(matchName(p.name)));
  for (const p of listed) if (switchedBy.has(matchName(p.name))) skipped.push({ patch: p, why: `switched off by ${switchedBy.get(matchName(p.name))}` });
  return { applied, skipped, problems: missingTargets(applied, items) };
}

function missingTargets(patches: Patch[], items: Item[]): string[] {
  const problems: string[] = [];
  const compositionNames = new Set(items.filter((i) => i.kind === "composition-rule").map((i) => matchName(i.name)));
  for (const patch of patches)
    for (const c of patch.changes) {
      const found = c.targetKind === "composition-rule" ? compositionNames.has(matchName(c.target.name)) : !!c.target.item && items.some((i) => i.key === c.target.item);
      if (!found) problems.push(`${patch.name}: nothing called “${c.target.name}” to change`);
    }
  return problems;
}

// The changes the applied patches make to one item, in order.
export function changesTo(item: Item, patches: Patch[]): { patch: Patch; change: PatchChange }[] {
  const out: { patch: Patch; change: PatchChange }[] = [];
  for (const patch of patches)
    for (const change of patch.changes) {
      const hits = change.targetKind === "composition-rule" ? item.kind === "composition-rule" && matchName(change.target.name) === matchName(item.name) : change.target.item === item.key;
      if (hits) out.push({ patch, change });
    }
  return out;
}

// What a step looks like on a card: "House rules: Lances free — Empire Knights: Equipment Options Lances(0)".
export function stepText(patch: Patch, change: PatchChange): string {
  return `${patch.name}: ${changeText(change)}`;
}

// --- Patching equipment, rules and composition rules (units: src/lists/unit-as-taken.ts) ----------

// The item with the applied patches' changes made; anything else is returned as it is.
export function patched(item: Item, patches: Patch[]): Item {
  const changes = changesTo(item, patches);
  if (changes.length === 0) return item;
  if (item.kind === "equipment") return changes.reduce((eq, { change }) => patchEquipment(eq, change), item);
  if (item.kind === "special-rule") return changes.reduce((r, { change }) => patchRule(r, change), item);
  if (item.kind === "composition-rule") return changes.reduce((r, { change }) => patchComposition(r, change), item);
  return item;
}

function patchEquipment(eq: Equipment, change: PatchChange): Equipment {
  const e = change.equipment;
  if (!e) return eq;
  return {
    ...eq,
    stats: patchStats(eq.stats, e.stats),
    save: e.save === undefined ? eq.save : patchStat(eq.save, e.save),
    cost: patchCost(eq.cost, e.cost),
    rules: patchList(eq.rules, e.rules),
    text: e.text ?? eq.text,
    type: e.type ?? eq.type,
    range: e.range ?? eq.range,
    armourPiercing: e.armourPiercing ?? eq.armourPiercing,
  };
}

function patchRule(rule: SpecialRule, change: PatchChange): SpecialRule {
  return { ...rule, text: change.rule?.text ?? rule.text, ruleType: change.rule?.ruleType ?? rule.ruleType };
}

function patchComposition(rule: CompositionRule, change: PatchChange): CompositionRule {
  return { ...rule, category: change.composition?.category ?? rule.category, limits: change.composition?.limits ?? rule.limits };
}

// --- The steps every kind shares ---------------------------------------------------------------

// "+1~pi" / "-1~pi" change the cost by that much; anything else sets it.
export function patchCost(current: Cost | undefined, change: Cost | undefined): Cost | undefined {
  if (!change) return current;
  if (change.adds && current) return { ...current, points: current.points + change.points };
  return change;
}

// "+1" / "-1" change a stat by that much; anything else sets it.
export function patchStat(current: Stat | undefined, change: Stat): Stat {
  const isDelta = typeof change !== "number" && change.change !== undefined && !change.when;
  if (!isDelta) return change;
  const by = (change as { change: number }).change;
  if (typeof current === "number") return current + by;
  if (current && typeof current !== "number" && current.value !== undefined) return { ...current, value: current.value + by };
  if (current && typeof current !== "number" && current.change !== undefined) return { ...current, change: current.change + by }; // a champion's "+1" made "+2"
  return current ?? change;
}

export function patchStats(current: Stats, change: Stats | undefined): Stats {
  if (!change) return current;
  const out = { ...current };
  for (const [name, stat] of Object.entries(change)) out[name] = patchStat(current[name], stat);
  return out;
}

// A list of names: "+X" adds, "-X" removes, "replace~X" takes X out; a plain list replaces it all;
// an empty list ("None") clears it.
export function patchList(current: Term[], change: Term[] | undefined): Term[] {
  if (change === undefined) return current;
  if (change.length === 0) return [];
  if (!change.some((t) => t.change)) return change;
  let out = [...current];
  for (const t of change) {
    if (t.change === "remove" || t.change === "replace") out = out.filter((r) => matchName(r.name) !== matchName(t.name));
    else out.push({ ...t, change: undefined });
  }
  return out.map(({ change: _, ...rest }) => rest);
}

// An options cell in a patch. The same name as an option already there replaces it where it stands
// (its group kept: "Lances(0)" makes Lances free without leaving its choose-one); "+X" adds a new
// choice; "-X" takes one out; "None" clears them all.
export function patchOptions(groups: OptionGroup[], cell: Options | undefined): OptionGroup[] {
  if (!cell) return groups;
  let out = cell.removeAllInherited ? [] : structuredClone(groups);
  for (const t of cell.removeInherited ?? []) out = out.map((g) => ({ ...g, options: g.options.filter((o) => matchName(o.name) !== matchName(t.name)) }));
  for (const group of cell.groups) {
    const single = group.options.length === 1 ? group.options[0] : undefined;
    const at = single && !single.addsToInherited ? out.find((g) => g.options.some((o) => matchName(o.name) === matchName(single.name))) : undefined;
    if (at && single) {
      at.options = at.options.map((o) => (matchName(o.name) === matchName(single.name) ? structuredClone(single) : o));
      continue;
    }
    const names = group.options.filter((o) => !o.addsToInherited).map((o) => matchName(o.name));
    out = out.map((g) => ({ ...g, options: g.options.filter((o) => !names.includes(matchName(o.name))) }));
    out.push(structuredClone({ ...group, options: group.options.map(({ addsToInherited: _, ...o }) => o) }));
  }
  return out.filter((g) => g.options.length > 0);
}
