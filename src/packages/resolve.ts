// Matching names to items, and the dependencies that follow from it.
// Data structure: rebuild/data-structure.md §2 (names, not keys, on upload), §5 (dependencies found
// and stated). Build-log Part B decisions 8–9: names match within the kind a column expects; a plain
// trailing "s" matches the name without it (Halberds -> Halberd); an item's aliases match too.

import type { Item, Option, Options, Package, Term, Unit } from "../items/items";
import { matchName } from "../items/keys";

export type Kind = "unit" | "equipment" | "special-rule" | "slot-kind";

// Every item of the matchable kinds, by kind and by matched name (including aliases).
export class NameIndex {
  private byKind = new Map<Kind, Map<string, string>>();

  constructor(items: Item[]) {
    // Real items first, so a stub never hides one of the same name.
    const ordered = [...items.filter((i) => i.status !== "stub"), ...items.filter((i) => i.status === "stub")];
    for (const item of ordered) {
      if (item.kind === "unit") this.add("unit", item.name, item.key);
      if (item.kind === "equipment") {
        this.add("equipment", item.name, item.key);
        for (const alias of item.aliases) this.add("equipment", alias, item.key);
      }
      if (item.kind === "special-rule") this.add("special-rule", item.name, item.key);
      if (item.kind === "slot-kind") this.add("slot-kind", item.code, item.key);
    }
  }

  private add(kind: Kind, name: string, key: string): void {
    if (!this.byKind.has(kind)) this.byKind.set(kind, new Map());
    const names = this.byKind.get(kind)!;
    const m = matchName(name);
    // A real item wins over a stub of the same name; otherwise the first one entered.
    if (!names.has(m)) names.set(m, key);
  }

  // The key for a name, trying each kind in order; null if nothing matches.
  find(name: string, kinds: Kind[]): string | null {
    const m = matchName(name);
    for (const kind of kinds) {
      const names = this.byKind.get(kind);
      if (!names) continue;
      if (names.has(m)) return names.get(m)!;
      if (m.endsWith("s") && names.has(m.slice(0, -1))) return names.get(m.slice(0, -1))!;
    }
    return null;
  }
}

// A name that matched nothing: where, in which package, and the kinds it was looked for in.
export type Unmatched = { name: string; where: string; inPackage: string | undefined; kinds: Kind[] };

// Fills in `item` on every name in the items given, against everything in `index`.
export function resolveNames(items: Item[], index: NameIndex): Unmatched[] {
  const unmatched: Unmatched[] = [];
  let inPackage: string | undefined;
  const look = (term: Term | Option, kinds: Kind[], where: string) => {
    term.item = index.find(term.name, kinds);
    if (term.item === null) unmatched.push({ name: term.name, where, inPackage, kinds });
  };
  const terms = (list: Term[] | undefined, kinds: Kind[], where: string) => list?.forEach((t) => look(t, kinds, where));
  const equipmentKinds = (t: Term | Option): Kind[] => (t.as === "Mount" ? ["unit"] : ["equipment", "unit"]);

  for (const item of items) {
    const where = item.name;
    inPackage = item.homePackage;
    if (item.kind === "unit") {
      if (item.inherits) look(item.inherits, ["unit"], where + ", inherits");
      for (const row of item.rows) {
        row.equipment.forEach((t) => look(t, equipmentKinds(t), where + ", equipment"));
        terms(row.rules.filter((t) => t.change !== "replace"), ["special-rule"], where + ", rules");
        resolveOptions(row.equipmentOptions, (o) => equipmentKinds(o), look, where + ", equipment options");
        resolveOptions(row.rulesOptions, () => ["special-rule"], look, where + ", rules options");
        row.slots?.slots.forEach((s) => {
          s.item = index.find(s.code, ["slot-kind"]);
          if (s.item === null) unmatched.push({ name: s.code, where: where + ", slots", inPackage, kinds: ["slot-kind"] });
        });
      }
    }
    if (item.kind === "equipment") {
      terms(item.countsAs, ["equipment"], where + ", counts as");
      terms(item.rules.filter(isRuleName), ["special-rule"], where + ", rules");
    }
    if (item.kind === "race-profile") terms(item.rules.filter(isRuleName), ["special-rule"], where + ", rules");
    if (item.kind === "slot-kind") terms(item.equipment, ["equipment"], where + ", equipment");
  }
  return unmatched;
}

// Conditions and statuses (Only, MayBe) are not names of items.
function isRuleName(t: Term): boolean {
  return !/^(only|maybe)$/i.test(t.name);
}

function resolveOptions(
  cell: Options | undefined,
  kinds: (o: Option | Term) => Kind[],
  look: (t: Term | Option, kinds: Kind[], where: string) => void,
  where: string,
): void {
  if (!cell) return;
  cell.removeInherited?.forEach((t) => look(t, kinds(t), where));
  for (const group of cell.groups)
    for (const option of group.options) {
      look(option, kinds(option), where);
      option.replaces?.forEach((t) => look(t, kinds(t), where));
      option.grants?.filter((g) => g.name !== "Troop Type").forEach((g) => look(g, ["special-rule"], where));
    }
}

// --- Dependencies found from references ---------------------------------------------------------

// For one package: every other package its members' names lead to, with the names that lead there.
// Worked out on read; never stored.
export function foundNeeds(pkg: Package, items: Item[]): Map<string, string[]> {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const needs = new Map<string, Set<string>>();
  const note = (key: string | null | undefined) => {
    if (!key) return;
    const target = byKey.get(key);
    if (!target?.homePackage || target.homePackage === pkg.key) return;
    if (!needs.has(target.homePackage)) needs.set(target.homePackage, new Set());
    needs.get(target.homePackage)!.add(target.name);
  };
  for (const key of pkg.members) {
    const item = byKey.get(key);
    if (item) for (const ref of referencesOf(item)) note(ref);
  }
  return new Map([...needs].map(([k, names]) => [k, [...names].sort()]));
}

// Every item key an item refers to.
export function referencesOf(item: Item): string[] {
  const out: (string | null | undefined)[] = [];
  const terms = (list?: Term[]) => list?.forEach((t) => out.push(t.item));
  const options = (cell?: Options) => {
    cell?.removeInherited?.forEach((t) => out.push(t.item));
    cell?.groups.forEach((g) => g.options.forEach((o) => (out.push(o.item), terms(o.grants), terms(o.replaces))));
  };
  if (item.kind === "unit") {
    out.push(item.inherits?.item);
    for (const row of (item as Unit).rows) {
      terms(row.equipment);
      terms(row.rules);
      options(row.equipmentOptions);
      options(row.rulesOptions);
      row.slots?.slots.forEach((s) => out.push(s.item));
    }
  }
  if (item.kind === "equipment") (terms(item.countsAs), terms(item.rules));
  if (item.kind === "race-profile") terms(item.rules);
  if (item.kind === "slot-kind") terms(item.equipment);
  if (item.kind === "army-list") (item.entries.forEach((e) => out.push(e.unit)), item.composition.forEach((c) => out.push(c)));
  return out.filter((k): k is string => typeof k === "string");
}
