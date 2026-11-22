// What sort of package each one is, for the Library's sections and views.
// Worked out from the package itself: its layer (design/v2-reconciliation.md §1: books → FAQs →
// house rules → campaign; the game's core), whether it holds an army list, and whether the app made it.

import type { Item, Package } from "../items/items";

export type PackageType = "core" | "composition" | "army" | "book" | "faq" | "house" | "campaign" | "stubs";

export const PACKAGE_TYPES: { type: PackageType; title: string }[] = [
  { type: "core", title: "Core rules" },
  { type: "composition", title: "Composition sets" },
  { type: "army", title: "Army books" },
  { type: "book", title: "Books" },
  { type: "faq", title: "FAQs" },
  { type: "house", title: "House rules" },
  { type: "campaign", title: "Campaign" },
  { type: "stubs", title: "Not entered yet" },
];

export function packageType(pkg: Package, byKey: Map<string, Item>): PackageType {
  if (pkg.stubsFor) return "stubs";
  if (isCompositionSet(pkg, byKey)) return "composition";
  if (pkg.layer === "core") return "core";
  if (pkg.layer === "book") return pkg.members.some((k) => byKey.get(k)?.kind === "army-list") ? "army" : "book";
  return pkg.layer;
}

// A composition set holds composition rules and nothing else (no army list): Standard, Grand Melee …
export function isCompositionSet(pkg: Package, byKey: Map<string, Item>): boolean {
  const members = pkg.members.map((k) => byKey.get(k));
  return members.length > 0 && members.every((m) => m?.kind === "composition-rule");
}
