// Links drawn on a map and on the Diagram (owner, 27 Nov), the same way in both:
//   - a line between the two ends, in its link kind's colour and line (or the link's own);
//   - one-way links carry an arrow at the middle, pointing from → to;
//   - several links between the same two items are spread apart, so each can be tapped;
//   - a "Links" set in the shared filter menu and side list: a row per plain link kind.
// Tap a line to select the link; double-tap to open its card. The selection bar for a link: open
// it, swap its ends, remove it.
// Design: design/world-structure.md §3 (topics are display groupings of link kinds, toggled like map
// layers); spec/authoring/authoring-v2.md §1. Core: src/world/links.ts.
import type { Item, Link } from "../../../items/items";
import { linkKindStyle, linkKindsInOrder, linkStyle, linkTitle, removeLink, swapEnds, type LinkStyle } from "../../../world/links";
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
  return { id: LINKS_SET, title: "Links", on, rows };
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
export function LinkLines({ lines, k, picked, gap = 10, bulge }: { lines: LinkLine[]; k: number; picked: string | null; gap?: number; bulge?: Point }) {
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
        const isPicked = picked === l.link.key;
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

// The selection bar for a picked link: its title, Open, Swap ends (one way), Remove.
export function LinkBar({ data, world, linkKey, onOpen, apply, onClose }: { data: AppData; world: string; linkKey: string; onOpen: () => void; apply: (items: Item[]) => Promise<void>; onClose: () => void }) {
  const link = data.items.find((i): i is Link => i.kind === "link" && i.key === linkKey);
  if (!link) return null;
  const oneWay = data.items.some((i) => i.kind === "link-kind" && i.key === link.linkKind && i.direction === "one-way");
  return (
    <>
      <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
      <div className="title">{linkTitle(data.items, link)}</div>
      <div className="selection-buttons">
        <button className="primary" onClick={onOpen}>Open</button>
        {oneWay && (
          <button onClick={async () => {
            const result = swapEnds(data.items, world, linkKey);
            if (result.problem) return alert(result.problem);
            await apply(result.items);
          }}>⇄ Swap ends</button>
        )}
        <button onClick={async () => (await apply(removeLink(data.items, linkKey)), onClose())}>Remove</button>
      </div>
    </>
  );
}
