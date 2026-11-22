// Items as YAML in their stored form: every field by its full name, nothing abbreviated.
// The way to ship data out readable without the app, and read it back in.
// Data structure: rebuild/data-structure.md §0 (stored records readable and shippable).

import YAML from "yaml";
import { Item } from "../items/items";

export function writeFullYaml(items: Item[]): string {
  return YAML.stringify({ items }, { lineWidth: 0 });
}

// Every item is checked against its kind's schema; a bad one is reported, not loaded.
export function readFullYaml(text: string): { items: Item[]; problems: string[] } {
  const parsed = YAML.parse(text) as { items?: unknown[] };
  const items: Item[] = [];
  const problems: string[] = [];
  (parsed?.items ?? []).forEach((raw, i) => {
    const result = Item.safeParse(raw);
    if (result.success) items.push(result.data);
    else problems.push(`item ${i + 1}: ${result.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  });
  return { items, problems };
}
