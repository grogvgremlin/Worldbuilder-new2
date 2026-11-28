// Links drawn on a map and on the Diagram (owner, 27 Nov), the same way in both:
//   - a line between the two ends, in its link kind's colour and line (or the link's own);
//   - one-way links carry an arrow at the middle, pointing from → to;
//   - several links between the same two items are spread apart, so each can be tapped;
//   - a "Links" set in the shared filter menu and side list: a row per plain link kind.
// Tap a line to select the link; double-tap to open its card. The selection bar for a link: open
// it, swap its ends, remove it.
// Design: design/world-structure.md §3 (topics are display groupings of link kinds, toggled like map
// layers); spec/authoring/authoring-v2.md §1. Core: src/world/links.ts.
import type { Item, Link, Thing } from "../../../items/items";
import { addLinksTo, containersFitting, holderKindsFor, holdsAll, linkKindStyle, linkKindsInOrder, linkStyle, linkTitle, newContainerOfLinks, removeLink, swapEnds, type LinkStyle } from "../../../world/links";
import { thingKindsIn } from "../../../world/world";
import { useState } from "react";
import type { OverlayRow, OverlaySet } from "./overlays";
import type { AppData } from "../../app-data";

type Point = { x: number; y: number };
export type LinkLine = { link: Link; a: Point; b: Point; style: LinkStyle; via?: boolean };

export const LINKS_SET = "links";
export const linkRowId = (linkKind: string) => `link|${linkKind}`;

// The Links set for the filter menu and side list: each plain link kind that has links.
export function linkSet(items: Item[], world: string, on: boolean, isOn: (linkKind: string) => boolean): OverlaySet {
  const used = new Set(items.filter((i): i is Link => i.kind === "link" && i.world === world).map((l) => l.linkKind));
  const rows: OverlayRow[] = linkKindsInOrder(items, world)
    .filter((k) => k.hierarchy === "none" && used.has(k.key))
    .map((k) => {
      const style = linkKindStyle(items, world, k);
      return { id: linkRowId(k.key), name: k.name, key: k.key, opens: "link-kind", depth: 0, on: on && isOn(k.key), colour: style.colour, line: style.line };
    });
  return { id: LINKS_SET, title: "Connectors", on, rows };
}

// Lines for links whose two ends have a position (`at` gives one, or null), in the link kinds shown.
export function linkLines(items: Item[], world: string, links: Link[], at: (thing: string) => { p: Point; via?: boolean } | null): LinkLine[] {
  const out: LinkLine[] = [];
  for (const link of links) {
    const a = at(link.from);
    const b = at(link.to);
    if (!a || !b) continue;
    if (a.p.x === b.p.x && a.p.y === b.p.y) continue; // both ends inside one folded box
    out.push({ link, a: a.p, b: b.p, style: linkStyle(items, world, link), via: a.via || b.via });
  }
  return out;
}

// The lines as SVG. `k` is the zoom (lines keep their width on screen); `gap` is the spread between
// links that share their ends; `bulge` bows every line out that way (the Diagram: boxes in one column
// would hide a straight line, so it bows out to the side).
export function LinkLines({ lines, k, picked, gap = 10, bulge }: { lines: LinkLine[]; k: number; picked: string[]; gap?: number; bulge?: Point }) {
  const pairs = new Map<string, LinkLine[]>();
  for (const l of lines) {
    const id = [l.link.from, l.link.to].sort().join("|");
    pairs.set(id, [...(pairs.get(id) ?? []), l]);
  }
  return (
    <g className="link-lines">
      {lines.map((l) => {
        const group = pairs.get([l.link.from, l.link.to].sort().join("|"))!;
        const n = group.indexOf(l);
        // Spread across the pair, measured the same way round for every link in it.
        const flip = l.link.from > l.link.to ? -1 : 1;
        const offset = ((n - (group.length - 1) / 2) * gap * flip) / k;
        const mid = bend(l.a, l.b, offset, bulge);
        const d = `M${l.a.x} ${l.a.y} Q${mid.control.x} ${mid.control.y} ${l.b.x} ${l.b.y}`;
        const dash = l.style.line === "dashed" ? `${8 / k} ${5 / k}` : l.style.line === "dotted" ? `${1.5 / k} ${4 / k}` : undefined;
        const isPicked = picked.includes(l.link.key);
        return (
          <g key={l.link.key} data-link={l.link.key} className={"link-line" + (isPicked ? " picked" : "") + (l.via ? " via" : "")} style={{ color: l.style.colour }}>
            <path className="link-hit" d={d} style={{ strokeWidth: 16 / k }} />
            <path className="link-stroke" d={d} style={{ strokeWidth: (isPicked ? 4 : 2.2) / k, strokeDasharray: dash }} />
            {l.style.arrow && <Arrow at={mid.point} towards={mid.tangent} k={k} />}
          </g>
        );
      })}
    </g>
  );
}

// A quadratic curve bowed sideways by `offset`: its control point, the point halfway along, and the
// direction there (for the arrow).
function bend(a: Point, b: Point, offset: number, bulge?: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const out = bulge ? 40 + length * 0.3 + offset * 3 : 0; // links between one pair: each further out
  const side = bulge ? { x: bulge.x * out, y: bulge.y * out } : { x: normal.x * offset * 2, y: normal.y * offset * 2 };
  const control = { x: (a.x + b.x) / 2 + side.x, y: (a.y + b.y) / 2 + side.y };
  const point = { x: 0.25 * a.x + 0.5 * control.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * control.y + 0.25 * b.y };
  return { control, point, tangent: { x: dx / length, y: dy / length } };
}

function Arrow({ at, towards, k }: { at: Point; towards: Point; k: number }) {
  const size = 7 / k;
  const back = { x: at.x - towards.x * size, y: at.y - towards.y * size };
  const side = { x: -towards.y * size * 0.6, y: towards.x * size * 0.6 };
  const tip = { x: at.x + towards.x * size, y: at.y + towards.y * size };
  return <polygon className="link-arrow" points={`${tip.x},${tip.y} ${back.x + side.x},${back.y + side.y} ${back.x - side.x},${back.y - side.y}`} />;
}

// The selection bar for picked links (owner, 28 Nov: several, as items): one link: its title, Open,
// Swap ends (one way), Remove; several: how many. Either: Link container… (put them in one, or a new
// one) and Clear.
export function LinkBar({ data, world, linkKeys, onOpen, onContainer, apply, onClose }: { data: AppData; world: string; linkKeys: string[]; onOpen: (key: string) => void; onContainer: () => void; apply: (items: Item[]) => Promise<void>; onClose: () => void }) {
  const links = linkKeys.map((k) => data.items.find((i): i is Link => i.kind === "link" && i.key === k)).filter((l): l is Link => !!l);
  if (links.length === 0) return null;
  const one = links.length === 1 ? links[0] : null;
  const oneWay = one && data.items.some((i) => i.kind === "link-kind" && i.key === one.linkKind && i.direction === "one-way");
  return (
    <>
      <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
      <div className="title">{one ? linkTitle(data.items, one) : `${links.length} connectors selected`}</div>
      <div className="selection-buttons">
        {one && <button className="primary" onClick={() => onOpen(one.key)}>Open</button>}
        <button className={one ? "" : "primary"} onClick={onContainer}>Link container…</button>
        {oneWay && (
          <button onClick={async () => {
            const result = swapEnds(data.items, world, one!.key);
            if (result.problem) return alert(result.problem);
            await apply(result.items);
          }}>⇄ Swap ends</button>
        )}
        {one && <button onClick={async () => (await apply(removeLink(data.items, one.key)), onClose())}>Remove</button>}
      </div>
    </>
  );
}

// Put the selected links in a link container (owner, 28 Nov): one they all fit, or a new item of a
// kind, pre-filled with a kind that can hold them; if no link container kind holds them in that kind
// of item yet, one is made to fit ("made of road", held by that kind) and said so.
export function LinkContainerPopup({ data, world, linkKeys, apply, onClose }: { data: AppData; world: string; linkKeys: string[]; apply: (items: Item[]) => Promise<void>; onClose: () => void }) {
  const kinds = thingKindsIn(data.items, world);
  const linkKinds = [...new Set(linkKeys.map((k) => data.items.find((i): i is Link => i.kind === "link" && i.key === k)?.linkKind).filter((k): k is string => !!k))];
  const holders = [...new Set(linkKinds.flatMap((lk) => holderKindsFor(data.items, world, lk)))];
  const [name, setName] = useState("");
  const [kind, setKind] = useState(holders[0] ?? kinds[0]?.key ?? "");
  const fitting = containersFitting(data.items, world, linkKeys);
  const run = async (result: { items: Item[]; problems: string[] }) => {
    await apply(result.items);
    if (result.problems.length) alert(`Not done:\n${result.problems.join("\n")}`);
    onClose();
  };
  const willMake = kind && !holdsAll(data.items, world, linkKeys, kind);
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>{linkKeys.length} connector{linkKeys.length === 1 ? "" : "s"} into a link container</h2>
        {fitting.length > 0 && (
          <label className="stack">
            <span className="sub">Into one they all fit</span>
            <select value="" onChange={(e) => e.target.value && run(addLinksTo(data.items, linkKeys, e.target.value))}>
              <option value="">Choose…</option>
              {fitting.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </label>
        )}
        <span className="sub">A new one</span>
        <div className="inline-add">
          <input className="filter" placeholder="Its name (e.g. The Great North Road)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
          </select>
          <button className="primary" disabled={!name.trim() || !kind} onClick={() => run(newContainerOfLinks(data.items, world, linkKeys, name, kind))}>Make</button>
        </div>
        {willMake && <p className="sub">No link container kind holds these in a {kinds.find((k) => k.key === kind)?.name} yet: one is made to fit ("made of {linkKinds.map((k) => data.items.find((i) => i.key === k)?.name).join(" and ")}"), to change under Kinds → Containers.</p>}
      </div>
    </div>
  );
}

// --- Link containers (owner, 27 Nov: "I don't see the containers of stretches on the diagram or map …
// this isn't explicitly about roads … it's about link containers") --------------------------------
// A world item made of links (its links are `partOf` it: a road, a river, a border, a trade route,
// whatever the world has) drawn as a wide band in its colour under its links, its name along the
// middle one; a "Made of links" set in the same filter menu and side list, a row per item.

export const LINK_CONTAINERS_SET = "link-containers";
export const containerRowId = (container: string) => `link-container|${container}`;
export const CONTAINER_COLOURS = ["#8a6d3b", "#3b6d8a", "#6d8a3b", "#8a3b6d"];

export type ContainerBand = { container: Thing; colour: string; links: { a: Point; b: Point }[] };

// The world items that links are part of, in name order.
export function linkContainersIn(items: Item[], world: string): Thing[] {
  const wholes = new Set(items.filter((i): i is Link => i.kind === "link" && i.world === world && !!i.partOf).flatMap((l) => l.partOf!));
  return items.filter((i): i is Thing => i.kind === "thing" && wholes.has(i.key)).sort((a, b) => a.name.localeCompare(b.name));
}

export function containerColour(items: Item[], world: string, container: Thing): string {
  return container.colour ?? CONTAINER_COLOURS[Math.max(0, linkContainersIn(items, world).findIndex((r) => r.key === container.key)) % CONTAINER_COLOURS.length];
}

export function linkContainerSet(items: Item[], world: string, on: boolean, isOn: (container: string) => boolean): OverlaySet {
  const rows: OverlayRow[] = linkContainersIn(items, world).map((r) => ({ id: containerRowId(r.key), name: r.name, key: r.key, opens: "place", depth: 0, on: on && isOn(r.key), colour: containerColour(items, world, r), line: "solid" }));
  return { id: LINK_CONTAINERS_SET, title: "Made of links", on, rows };
}

// Bands for the containers shown, from where each link's ends are drawn (`at`); a link with an end
// not drawn is left out.
export function containerBands(items: Item[], world: string, containers: Thing[], at: (thing: string) => { p: Point } | null): ContainerBand[] {
  return containers.map((container) => ({
    container,
    colour: containerColour(items, world, container),
    links: items
      .filter((i): i is Link => i.kind === "link" && i.world === world && !!i.partOf?.includes(container.key))
      .map((l) => ({ a: at(l.from)?.p, b: at(l.to)?.p }))
      .filter((s): s is { a: Point; b: Point } => !!s.a && !!s.b),
  })).filter((r) => r.links.length > 0);
}

// Drawn under the links: the same bow as the links (`bulge`), so a band follows its line.
export function ContainerBands({ bands, k, bulge }: { bands: ContainerBand[]; k: number; bulge?: Point }) {
  return (
    <g className="container-bands">
      {bands.map((band) => {
        const middle = band.links[Math.floor(band.links.length / 2)];
        const label = bend(middle.a, middle.b, 0, bulge).point;
        return (
          <g key={band.container.key} style={{ color: band.colour }}>
            {band.links.map((s, n) => {
              const c = bend(s.a, s.b, 0, bulge).control;
              return <path key={n} className="container-band" d={`M${s.a.x} ${s.a.y} Q${c.x} ${c.y} ${s.b.x} ${s.b.y}`} style={{ strokeWidth: 12 / k }} />;
            })}
            <text className="container-name" x={label.x} y={label.y - 9 / k} style={{ fontSize: 10.5 / k }}>{band.container.name}</text>
          </g>
        );
      })}
    </g>
  );
}
