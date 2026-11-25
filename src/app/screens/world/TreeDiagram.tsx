// World → Diagram: a tree as a diagram, rearranged by dragging (owner, 25 Nov: "a rearrangeable
// tree diagram"). Drag an item onto another to move it inside; onto the world to move it to the top.
// Tap an item to open it. Drag the background to pan; pinch or the wheel to zoom.
// Laid out left to right (it fits a phone held upright), worked out from the links each time:
// nothing about the drawing is stored.
// Design: design/world-structure.md §3 (one parent at a time, no loops: a drop that would make a loop
// is refused), §5 ("abstract views zoom by containment"); spec/session-20-notes-3.md §0.1 (a canvas
// as another view on the same structure).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { Thing } from "../../../items/items";
import { childrenOf, descendantsOf, setParent, topPlaces } from "../../../world/places";
import { isOnlyAGroup } from "../../../world/groups";
import { iconOf } from "../../../world/maps";
import { worldOf } from "../../../world/world";
import type { AppData } from "../../app-data";
import { TreePicker, useChosenTree } from "./tree-picker";
import type { Part } from "./WorldScreen";

const NODE_W = 132;
const NODE_H = 34;
const COLUMN = 168; // from one depth to the next
const ROW = 44; // from one leaf to the next
const TAP = 6;
const ROOT = "(world)";

type Box = { key: string; thing: Thing | null; x: number; y: number; parent: string | null };
type View = { k: number; tx: number; ty: number };
type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; from: View; moved: boolean }
  | { kind: "node"; key: string; start: Point; moved: boolean }
  | { kind: "pinch"; startDistance: number; startCentre: Point; from: View }
  | null;

// Leaves one row apart; a parent level with the middle of its children.
function layout(data: AppData, world: string, tree: string | undefined): Box[] {
  const boxes: Box[] = [];
  let row = 0;
  const place = (thing: Thing | null, key: string, depth: number, parent: string | null, children: Thing[]): number => {
    const ys = children.map((c) => place(c, c.key, depth + 1, key, childrenOf(data.items, world, c.key, tree)));
    const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : row++ * ROW;
    boxes.push({ key, thing, x: depth * COLUMN, y, parent });
    return y;
  };
  const tops = topPlaces(data.items, world, tree).filter((t) => !isOnlyAGroup(data.items, world, t.key));
  place(null, ROOT, 0, null, tops);
  return boxes;
}

export function TreeDiagram({ data, nav, world, save }: Part) {
  const [tree, setTree] = useChosenTree(data, world);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ key: string; at: Point; over: string | null } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);
  const boxes = layout(data, world, tree);
  const byKey = new Map(boxes.map((b) => [b.key, b]));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  // The whole diagram in view, but never smaller than 60% (the names must stay readable): a big
  // tree then starts at its top left, to be panned.
  const fit = (): View | null => {
    if (!size) return null;
    const width = Math.max(...boxes.map((b) => b.x)) + NODE_W;
    const top = Math.min(...boxes.map((b) => b.y)) - NODE_H / 2;
    const height = Math.max(...boxes.map((b) => b.y)) + NODE_H / 2 - top;
    const k = clamp(Math.min((size.w - 24) / width, (size.h - 24) / height), 0.6, 1);
    return { k, tx: 12, ty: 12 - top * k };
  };
  useEffect(() => {
    if (size && !view) setView(fit());
  }, [size, view]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const box = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const toDiagram = (p: Point, v: View): Point => ({ x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k });

  // The box under a point, if any (a node's whole rectangle counts).
  const boxAt = (p: Point): Box | undefined => boxes.find((b) => p.x >= b.x && p.x <= b.x + NODE_W && Math.abs(p.y - b.y) <= NODE_H / 2);

  // Where a dragged item may go: not onto itself or anything it holds.
  const canDrop = (dragged: string, target: string | undefined): boolean => {
    if (!target || target === dragged) return false;
    if (target === ROOT) return true;
    return !descendantsOf(data.items, world, dragged, tree).some((d) => d.key === target);
  };

  const down = (e: ReactPointerEvent) => {
    if (!view) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", startDistance: distance(a, b), startCentre: middle(a, b), from: view };
      setDrag(null);
      return;
    }
    const node = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
    gesture.current = node && node !== ROOT ? { kind: "node", key: node, start: local(e), moved: false } : { kind: "pan", start: local(e), from: view, moved: false };
  };

  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !view) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const at = local(e);
    if (g?.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const k = clamp(g.from.k * (distance(a, b) / g.startDistance), 0.2, 3);
      const anchor = toDiagram(g.startCentre, g.from);
      const centre = middle(a, b);
      setView({ k, tx: centre.x - anchor.x * k, ty: centre.y - anchor.y * k });
    } else if (g?.kind === "pan") {
      if (!g.moved && distance(at, g.start) < TAP) return;
      g.moved = true;
      setView({ k: g.from.k, tx: g.from.tx + at.x - g.start.x, ty: g.from.ty + at.y - g.start.y });
    } else if (g?.kind === "node") {
      if (!g.moved && distance(at, g.start) < TAP) return;
      g.moved = true;
      const p = toDiagram(at, view);
      const target = boxAt(p)?.key;
      setDrag({ key: g.key, at: p, over: canDrop(g.key, target) ? target! : null });
    }
  };

  const up = async (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g?.kind !== "node") return;
    if (!g.moved) return nav.open({ name: "place", key: g.key });
    const target = drag?.over;
    setDrag(null);
    if (!target) return; // dropped nowhere useful: it goes back where it was
    const parent = target === ROOT ? null : target;
    if (parent === (byKey.get(g.key)?.parent === ROOT ? null : byKey.get(g.key)?.parent)) return;
    const result = setParent(data.items, world, g.key, parent, tree);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };

  const wheel = (e: WheelEvent) => {
    if (!view) return;
    const at = local(e);
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), 0.2, 3);
    const anchor = toDiagram(at, view);
    setView({ k, tx: at.x - anchor.x * k, ty: at.y - anchor.y * k });
  };

  const worldName = worldOf(data.items, world)?.name ?? "World";
  const label = (b: Box) => (b.thing ? `${iconOf(data.items, b.thing)} ${b.thing.name}` : `🌍 ${worldName}`);

  return (
    <>
      <div className="view-row">
        <span className="sub">Drag an item onto another to move it inside; onto the world for the top. Tap to open.</span>
        <span className="map-tools">
          <TreePicker data={data} world={world} tree={tree} onChoose={setTree} />
          <button className="tool" onClick={() => setView(fit())}>Fit</button>
        </span>
      </div>
      <div className="map-wrap diagram-wrap" ref={wrap} onTouchStart={(e) => e.stopPropagation()} onWheel={wheel}>
        {size && view && (
          <svg width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {boxes.filter((b) => b.parent).map((b) => {
                const p = byKey.get(b.parent!)!;
                const x1 = p.x + NODE_W;
                const x2 = b.x;
                return <path key={`edge-${b.key}`} className="diagram-edge" d={`M${x1} ${p.y} C${(x1 + x2) / 2} ${p.y}, ${(x1 + x2) / 2} ${b.y}, ${x2} ${b.y}`} />;
              })}
              {boxes.map((b) => (
                <g key={b.key} data-node={b.key} transform={`translate(${b.x} ${b.y - NODE_H / 2})`} className={["diagram-node", b.key === ROOT ? "root" : "", drag?.key === b.key ? "dragging" : "", drag?.over === b.key ? "target" : ""].join(" ")}>
                  <rect width={NODE_W} height={NODE_H} rx={8} />
                  <text x={10} y={NODE_H / 2 + 5}>{clip(label(b), 17)}</text>
                </g>
              ))}
              {drag && (
                <g className="diagram-node ghost" transform={`translate(${drag.at.x - NODE_W / 2} ${drag.at.y - NODE_H / 2})`}>
                  <rect width={NODE_W} height={NODE_H} rx={8} />
                  <text x={10} y={NODE_H / 2 + 5}>{clip(label(byKey.get(drag.key)!), 17)}</text>
                </g>
              )}
            </g>
          </svg>
        )}
      </div>
    </>
  );
}

function clip(text: string, most: number): string {
  return [...text].length > most ? [...text].slice(0, most - 1).join("") + "…" : text;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}
