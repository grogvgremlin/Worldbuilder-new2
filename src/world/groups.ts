// Groups of places: area things, joined many-to-many (a place in several groups at once; groups
// overlapping), alongside the one-parent containment tree.
// Design: design/world-structure.md §4 ("areas of effect are area things linked by *in area*,
// many-to-many, spanning levels and meshes"; membership by hand, or later from a drawn shape, §5.1),
// §3 (a link kind declared "several parents": no loops); spec/foundations/reach.md §7.
// Which link kinds group is declared on the link kind (hierarchy "several parents"), never a name.
// Owner, 25 Nov: a border town's two halves each sit in their own province, and the town as a whole
// is a group of the two.

import type { Item, Link, LinkKind, Thing } from "../items/items";
import { linkKindsIn, linksIn, newLink, thingsIn, worldOf } from "./world";
import { refusal } from "./kinds";
import { descendantsOf, firstTree } from "./places";

export type Membership = { link: Link; linkKind: LinkKind; thing: Thing };

// The world's grouping link kinds: those declared "several parents".
export function groupLinkKinds(items: Item[], world: string): LinkKind[] {
  return linkKindsIn(items, world).filter((k) => k.hierarchy === "several parents");
}

function groupLinks(items: Item[], world: string): { link: Link; linkKind: LinkKind }[] {
  const kinds = new Map(groupLinkKinds(items, world).map((k) => [k.key, k]));
  return linksIn(items, world)
    .filter((l) => kinds.has(l.linkKind))
    .map((l) => ({ link: l, linkKind: kinds.get(l.linkKind)! }));
}

// The groups a thing is in, by name.
export function groupsOf(items: Item[], world: string, thing: string): Membership[] {
  const things = new Map(thingsIn(items, world).map((t) => [t.key, t]));
  return groupLinks(items, world)
    .filter((g) => g.link.from === thing && things.has(g.link.to))
    .map((g) => ({ ...g, thing: things.get(g.link.to)! }))
    .sort((a, b) => a.thing.name.localeCompare(b.thing.name));
}

// The members of a group, by name.
export function membersOf(items: Item[], world: string, group: string): Membership[] {
  const things = new Map(thingsIn(items, world).map((t) => [t.key, t]));
  return groupLinks(items, world)
    .filter((g) => g.link.to === group && things.has(g.link.from))
    .map((g) => ({ ...g, thing: things.get(g.link.from)! }))
    .sort((a, b) => a.thing.name.localeCompare(b.thing.name));
}

// Every thing that has members: the world's groups.
export function groupsIn(items: Item[], world: string): Thing[] {
  const keys = new Set(groupLinks(items, world).map((g) => g.link.to));
  return thingsIn(items, world).filter((t) => keys.has(t.key)).sort((a, b) => a.name.localeCompare(b.name));
}

// A group and nothing else: it has members but sits nowhere in the containment tree, so the tree
// leaves it out and the groups list shows it (the plague zone; the bridge town as a whole).
export function isOnlyAGroup(items: Item[], world: string, thing: string): boolean {
  const tree = firstTree(items, world);
  const inTree = linksIn(items, world).some((l) => l.linkKind === tree && (l.from === thing || l.to === thing));
  return !inTree && membersOf(items, world, thing).length > 0;
}

// Everything inside a group at any depth along its own link kind (a group of groups).
function withinGroup(items: Item[], world: string, group: string, linkKind: string): Set<string> {
  const out = new Set<string>();
  const walk = (key: string) => {
    for (const m of membersOf(items, world, key)) {
      if (m.linkKind.key !== linkKind || out.has(m.thing.key)) continue;
      out.add(m.thing.key);
      walk(m.thing.key);
    }
  };
  walk(group);
  return out;
}

// What a membership brings beyond the member itself: a container's contents in one tree, or a
// group's members (owner, 26 Nov; when a container holds things in several trees, which tree is said).
export type Brings = { brings: "contents"; tree: string } | { brings: "members" };

// Puts a thing in a group, alone or bringing what it holds. Refused if it's the group itself, already
// in it, or would make a loop (§3: several parents, no loops).
export function addToGroup(items: Item[], world: string, member: string, linkKind: string, group: string, scope?: Brings): { items: Item[]; problem?: string } {
  if (member === group) return { items, problem: "a group can't be in itself" };
  const already = linksIn(items, world).some((l) => l.linkKind === linkKind && l.from === member && l.to === group);
  if (already) return { items, problem: "it's in that group already" };
  if (withinGroup(items, world, member, linkKind).has(group)) return { items, problem: "that group is inside this one already" };
  const wrong = refusal(items, world, linkKind, "from", member) ?? refusal(items, world, linkKind, "to", group);
  if (wrong) return { items, problem: wrong };
  const link = newLink(items, world, member, linkKind, group);
  if (scope?.brings === "contents") Object.assign(link, { brings: "contents", broughtFrom: scope.tree });
  if (scope?.brings === "members") Object.assign(link, { brings: "members" });
  return { items: [...items, link] };
}

export function removeFromGroup(items: Item[], world: string, member: string, linkKind: string, group: string): Item[] {
  return items.filter((i) => !(i.kind === "link" && i.world === world && i.linkKind === linkKind && i.from === member && i.to === group));
}

// A grouping link kind for a world made before groups came (owner, 25 Nov): "in area" / "covers".
export function newGroupLinkKind(items: Item[], world: string, key: string): LinkKind {
  return { key, kind: "link-kind", world, name: "in area", reverseName: "covers", direction: "one-way", hierarchy: "several parents", about: "A place in a group: many groups at once, overlaps allowed." };
}

// --- Scoped groups: members worked out from what each membership brings (owner, 26 Nov) ----------
// Design: rules-overlay.md §6, named scopes ("a saved query that follows the world"): a town added to
// Averland later is in a group that took Averland with its contents, with no edit.

export type GroupMember = { thing: Thing; via: Thing | null; link: Link | null }; // via: the member that brought it

// Everything in a group: each direct member, what it brings (contents in its tree, or a group's own
// members, at any depth), less what the group excludes. First reason found is kept.
export function effectiveMembers(items: Item[], world: string, group: string): GroupMember[] {
  const things = new Map(thingsIn(items, world).map((t) => [t.key, t]));
  const excluded = new Set(things.get(group)?.excludedMembers ?? []);
  const out = new Map<string, GroupMember>();
  const seenGroups = new Set<string>([group]);
  const add = (key: string, via: Thing | null, link: Link | null) => {
    if (key === group || excluded.has(key) || out.has(key) || !things.has(key)) return;
    out.set(key, { thing: things.get(key)!, via, link });
  };
  const walk = (g: string, via: Thing | null) => {
    for (const m of membersOf(items, world, g)) {
      add(m.thing.key, via, via ? null : m.link);
      const brought = via ?? m.thing;
      if (m.link.brings === "contents" && m.link.broughtFrom) {
        for (const d of descendantsOf(items, world, m.thing.key, m.link.broughtFrom)) add(d.key, brought, null);
      }
      if (m.link.brings === "members" && !seenGroups.has(m.thing.key)) {
        seenGroups.add(m.thing.key);
        walk(m.thing.key, brought);
      }
    }
  };
  walk(group, null);
  return [...out.values()].sort((a, b) => a.thing.name.localeCompare(b.thing.name));
}

// The groups an item is in, directly or brought in by a member (with that member), by name.
export function groupsWithMember(items: Item[], world: string, thing: string): { group: Thing; via: Thing | null }[] {
  const out: { group: Thing; via: Thing | null }[] = [];
  for (const g of groupsIn(items, world)) {
    const found = effectiveMembers(items, world, g.key).find((m) => m.thing.key === thing);
    if (found) out.push({ group: g, via: found.via });
  }
  return out;
}

// Leaves an item brought in by a member out of a group, or puts it back.
export function excludeFromGroup(items: Item[], group: string, thing: string, exclude: boolean): Item[] {
  return items.map((i) => {
    if (i.kind !== "thing" || i.key !== group) return i;
    const now = (i.excludedMembers ?? []).filter((k) => k !== thing);
    const next = exclude ? [...now, thing] : now;
    return { ...i, excludedMembers: next.length ? next : undefined };
  });
}

// What a container or group could bring if added to a group: its contents in each tree it holds
// something in, or its members. More than one: the owner says which (owner, 26 Nov: "specify the
// scope if it's ambiguous").
export function broughtOptions(items: Item[], world: string, thing: string, treesOf: { key: string; name: string }[]): { scope: Brings; label: string }[] {
  const out: { scope: Brings; label: string }[] = [];
  for (const t of treesOf) {
    const n = descendantsOf(items, world, thing, t.key).length;
    if (n > 0) out.push({ scope: { brings: "contents", tree: t.key }, label: `with everything inside it in "${t.name}" (${n})` });
  }
  const members = membersOf(items, world, thing).length;
  if (members > 0) out.push({ scope: { brings: "members" }, label: `with its members (${members})` });
  return out;
}
