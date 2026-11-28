// A network as a diagram (owner, 27 Nov: "a link type treated like a tree view: loose items, hide
// items, the network … in diagrams and across the whole link network"). A connection link kind
// (hierarchy none) chosen in the Diagram: the items joined by it are boxes, its links the lines
// between them. Laid out automatically, then wherever the owner drags them (kept per link kind and
// direction, as trees are). Items that fit the link kind but are on none of its links are loose:
// shown after the rest, or hidden, all or one by one, as in a tree.
// Design: design/world-structure.md §3 (different views are different link kinds; topics are display
// groupings of link kinds), §5 (abstract views); spec/session-20-notes-3.md §0.1 (a canvas as another
// view on the same structure).

import type { Item, LinkKind, Thing } from "../items/items";
import { inOrder, misfit } from "./kinds";
import { linkKindsIn, linksIn, thingsIn } from "./world";

// Connection link kinds, in the world's order: each can be shown as a network.
export function networkKinds(items: Item[], world: string): LinkKind[] {
  return inOrder(items, world, linkKindsIn(items, world).filter((k) => k.hierarchy === "none"));
}

export function isNetwork(items: Item[], world: string, key: string | undefined): boolean {
  return !!key && linkKindsIn(items, world).some((k) => k.key === key && k.hierarchy === "none");
}

// Items joined to one another by this link kind, each with who it's joined to.
export function neighbours(items: Item[], world: string, kind: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const l of linksIn(items, world).filter((l) => l.linkKind === kind)) {
    if (!out.has(l.from)) out.set(l.from, new Set());
    if (!out.has(l.to)) out.set(l.to, new Set());
    out.get(l.from)!.add(l.to);
    out.get(l.to)!.add(l.from);
  }
  return out;
}

// What the network shows (owner, 28 Nov): its joined items (in scope: they have a connector of this
// type), then the items brought into its workspace to be joined (in scope for now, not stored).
export function networkItems(items: Item[], world: string, kind: string, workspace: string[] = []): { joined: Thing[]; loose: Thing[] } {
  const near = neighbours(items, world, kind);
  const joined = thingsIn(items, world).filter((t) => near.has(t.key));
  const loose = thingsIn(items, world).filter((t) => workspace.includes(t.key) && !near.has(t.key));
  return { joined, loose };
}

// What a network type would join but has no connector of it (and isn't in the workspace): out of scope.
export function networkOutOfScope(items: Item[], world: string, kind: string, workspace: string[] = []): Thing[] {
  const near = neighbours(items, world, kind);
  return thingsIn(items, world)
    .filter((t) => !near.has(t.key) && !workspace.includes(t.key))
    .filter((t) => misfit(items, world, kind, "from", t.key) === null || misfit(items, world, kind, "to", t.key) === null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Each separate part of the network (items reachable from one another), its items in layers: the
// best-joined item first, then those one link away, then two … Parts with more items come first.
export function networkLayers(items: Item[], world: string, kind: string): Thing[][][] {
  const near = neighbours(items, world, kind);
  const things = new Map(networkItems(items, world, kind).joined.map((t) => [t.key, t]));
  const degree = (k: string) => near.get(k)?.size ?? 0;
  const order = [...things.values()].sort((a, b) => degree(b.key) - degree(a.key) || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const parts: Thing[][][] = [];
  for (const start of order) {
    if (seen.has(start.key)) continue;
    seen.add(start.key);
    const layers: Thing[][] = [[start]];
    for (;;) {
      const next: Thing[] = [];
      for (const t of layers[layers.length - 1]) {
        for (const n of [...(near.get(t.key) ?? [])].sort()) {
          if (seen.has(n) || !things.has(n)) continue;
          seen.add(n);
          next.push(things.get(n)!);
        }
      }
      if (next.length === 0) break;
      layers.push(next.sort((a, b) => a.name.localeCompare(b.name)));
    }
    parts.push(layers);
  }
  return parts.sort((a, b) => b.flat().length - a.flat().length);
}
