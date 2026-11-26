// Outlines on the Diagram (owner, 26 Nov: "highlighting groups and external tree containers in the
// same way as on maps … as borders and dotted lines rather than areas"). For each group, and each
// container in another tree, the boxes of what it holds that are drawn in this tree's Diagram.
// Worked out, never stored. Design: design/world-structure.md §3–4 (trees and groups).

import type { Item, Thing } from "../items/items";
import { groupsIn, membersOf } from "./groups";
import { childrenOf, descendantsOf } from "./places";
import { thingsIn } from "./world";

export type Outline = { thing: Thing; by: "group" | "tree"; tree?: string; members: string[] };

// Every group's members (one hop: a group reaches its members, not what they hold).
export function groupOutlines(items: Item[], world: string): Outline[] {
  return groupsIn(items, world).map((g) => ({ thing: g, by: "group" as const, members: membersOf(items, world, g.key).map((m) => m.thing.key) }));
}

// Every container in another tree, with everything it holds there.
export function treeOutlines(items: Item[], world: string, tree: string): Outline[] {
  return thingsIn(items, world)
    .filter((t) => childrenOf(items, world, t.key, tree).length > 0)
    .map((t) => ({ thing: t, by: "tree" as const, tree, members: descendantsOf(items, world, t.key, tree).map((d) => d.key) }));
}
