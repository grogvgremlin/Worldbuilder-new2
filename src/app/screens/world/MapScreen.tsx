// World → a map: places pinned on a blank sheet. Drag the sheet to pan, pinch (or the wheel) to
// zoom, drag a pin to move it, tap a pin for its card, "+ Place" then tap the sheet to pin one.
// Places holding pinned places show as soft areas around them (worked out, never stored).
// Design: design/world-structure.md §5 (pin things to a map; pins per map in its own coordinates;
// abstract views zoom by containment); spec/pillars/background-and-narrative.md §6 (pin icons from
// the kind; labels from names; in-tool drawing minimal); session-20 notes 3 §0 (world leads on
// desktop, works on the phone).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { Thing, WorldMap } from "../../../items/items";
import { areasOn, iconOf, notOnMap, placePin, removePin, type Area } from "../../../world/maps";
import { pathOf } from "../../../world/places";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NewPlace } from "./WorldScreen";
import { TextBox } from "./text-box";

type View = { k: number; tx: number; ty: number }; // screen = map × k + t
type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; from: View; moved: boolean }
  | { kind: "pin"; thing: string; start: Point; moved: boolean }
  | { kind: "pinch"; startDistance: number; startCentre: Point; from: View }
  | null;

const TAP = 6; // px a finger may wander and still be a tap
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 12;

export function MapScreen({ data, nav, mapKey, focus, place }: { data: AppData; nav: Nav; mapKey: string; focus?: string; place?: string }) {
  const stored = data.items.find((i): i is WorldMap => i.kind === "map" && i.key === mapKey);
  const [map, setMap] = useState<WorldMap | undefined>(stored); // the pins as shown (live while dragging)
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [placing, setPlacing] = useState<string | null>(place ?? null);
  const [adding, setAdding] = useState(false);
  const [showAreas, setShowAreas] = useState(true);
  const [locked, setLocked] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);

  // The sheet's size on screen, kept up to date (turning the phone, resizing the window).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  // First sight: the whole map, or zoomed onto the place it was opened for.
  useEffect(() => {
    if (!size || view || !map) return;
    const fit = fitView(map, size);
    const pin = focus ? map.pins.find((p) => p.thing === focus) : undefined;
    setView(pin ? centreOn(pin, Math.min(fit.k * 2.5, MAX_ZOOM), size) : fit);
  }, [size, view, map, focus]);

  if (!map) return <p className="hint">This map isn't in the world any more.</p>;
  const things = new Map(thingsIn(data.items, map.world).map((t) => [t.key, t]));
  const save = async (next: WorldMap) => {
    setMap(next);
    await data.putItem(next);
  };

  // --- Pointer handling: one finger pans or drags a pin; two pinch -------------------------------
  const local = (e: { clientX: number; clientY: number }): Point => {
    const box = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const toMap = (p: Point, v: View): Point => ({ x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k });

  const down = (e: ReactPointerEvent) => {
    if (!view) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", startDistance: distance(a, b), startCentre: middle(a, b), from: view };
      return;
    }
    const pin = (e.target as Element).closest("[data-pin]")?.getAttribute("data-pin");
    gesture.current = pin && !placing ? { kind: "pin", thing: pin, start: local(e), moved: false } : { kind: "pan", start: local(e), from: view, moved: false };
  };

  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !view) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const at = local(e);
    if (g?.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const k = clamp(g.from.k * (distance(a, b) / g.startDistance), MIN_ZOOM, MAX_ZOOM);
      const anchor = toMap(g.startCentre, g.from);
      const centre = middle(a, b);
      setView({ k, tx: centre.x - anchor.x * k, ty: centre.y - anchor.y * k });
    } else if (g?.kind === "pan") {
      if (!g.moved && distance(at, g.start) < TAP) return;
      g.moved = true;
      setView({ k: g.from.k, tx: g.from.tx + at.x - g.start.x, ty: g.from.ty + at.y - g.start.y });
    } else if (g?.kind === "pin") {
      if (!g.moved && distance(at, g.start) < TAP) return;
      if (locked) {
        // Pins locked: a drag that starts on a pin pans instead.
        gesture.current = { kind: "pan", start: g.start, from: view, moved: true };
        return;
      }
      g.moved = true;
      const p = toMap(at, view);
      setMap((m) => (m ? placePin(m, g.thing, p.x, p.y) : m));
    }
  };

  const up = async (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return; // a finger lifted after a pinch is never a tap
    }
    gesture.current = null;
    if (!view) return;
    if (g?.kind === "pin") {
      if (g.moved) await save(map);
      else setSelected(g.thing === selected ? null : g.thing);
    } else if (g?.kind === "pan" && !g.moved) {
      if (placing) {
        const p = toMap(local(e), view);
        await save(placePin(map, placing, p.x, p.y));
        setSelected(placing);
        setPlacing(null);
      } else setSelected(null);
    }
  };

  const wheel = (e: WheelEvent) => {
    if (!view) return;
    const at = local(e);
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    const anchor = toMap(at, view);
    setView({ k, tx: at.x - anchor.x * k, ty: at.y - anchor.y * k });
  };

  const selectedThing = selected ? things.get(selected) : undefined;
  const placingThing = placing ? things.get(placing) : undefined;

  return (
    <section className="map-screen">
      <div className="map-bar">
        <h1>{map.name}</h1>
        <span className="map-tools">
          <button className="primary" onClick={() => setAdding(true)}>+ Place</button>
          <button className={showAreas ? "tool on" : "tool"} onClick={() => setShowAreas(!showAreas)}>Areas</button>
          <button className={locked ? "tool on" : "tool"} onClick={() => setLocked(!locked)}>{locked ? "Locked" : "Lock"}</button>
          <button className="tool" onClick={() => size && setView(fitView(map, size))}>Fit</button>
        </span>
      </div>
      {placingThing && (
        <div className="map-banner">
          Tap the map to place <b>{placingThing.name}</b> <button className="link" onClick={() => setPlacing(null)}>Cancel</button>
        </div>
      )}
      <div className="map-wrap" ref={wrap} onTouchStart={(e) => e.stopPropagation()} onWheel={wheel}>
        {size && view && (
          <svg width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={placing ? "placing" : ""}>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              <rect className="map-sheet" x={0} y={0} width={map.width} height={map.height} rx={8 / view.k} />
              {showAreas && <Areas areas={areasOn(data.items, map)} k={view.k} />}
              {map.pins.map((p) => {
                const thing = things.get(p.thing);
                if (!thing) return null;
                return (
                  <g key={p.thing} data-pin={p.thing} transform={`translate(${p.x} ${p.y}) scale(${1 / view.k})`} className={p.thing === selected ? "pin on" : "pin"}>
                    <circle r={13} className="pin-dot" />
                    <text className="pin-icon" y={5}>{iconOf(data.items, thing)}</text>
                    <text className="pin-label" y={27}>{thing.name}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {selectedThing && (
        <PinCard
          data={data}
          thing={selectedThing}
          onOpen={() => nav.open({ name: "place", key: selectedThing.key })}
          onUnpin={async () => (await save(removePin(map, selectedThing.key)), setSelected(null))}
          onClose={() => setSelected(null)}
        />
      )}
      {adding && <AddSheet data={data} map={map} onPick={(key) => (setAdding(false), setSelected(null), setPlacing(key))} onClose={() => setAdding(false)} />}

      <details className="how map-settings">
        <summary>This map</summary>
        <label className="stack">
          <span className="sub">Name</span>
          <TextBox className="filter" value={map.name} onSave={(v) => v && save({ ...map, name: v })} />
        </label>
        <label className="stack">
          <span className="sub">Description</span>
          <TextBox multiline className="description-box" value={map.description ?? ""} placeholder="What it shows, who drew it, when" onSave={(v) => save({ ...map, description: v || undefined })} />
        </label>
        <p className="sub">A drawn map is unreliable for scale: distances come from the links between places, not from where the pins sit. A picture behind the map comes with images.</p>
        <div className="buttons">
          <button className="danger" onClick={async () => {
            if (!confirm(`Remove the map ${map.name}? Its places stay in the world.`)) return;
            await data.removeItems([map.key]);
            nav.back();
          }}>Remove this map</button>
        </div>
      </details>
    </section>
  );
}

// A place holding pinned places: a soft shape round them, with its name along the top. The padding
// is a fixed size on screen, wider the higher the place sits in the tree, so nested areas sit inside
// and their names stack instead of colliding.
function Areas({ areas, k }: { areas: Area[]; k: number }) {
  const deepest = Math.max(0, ...areas.map((a) => a.depth));
  return (
    <g className="areas">
      {areas.map((a) => {
        const pad = 28 + (deepest - a.depth) * 16; // px on screen
        const d = a.outline.map((p, n) => `${n ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";
        const top = a.outline.reduce((best, p) => (p.y < best.y ? p : best), a.outline[0]);
        return (
          <g key={a.thing.key} className={`area depth-${a.depth % 4}`}>
            <path d={d} strokeWidth={(pad * 2) / k} />
            <text x={top.x} y={top.y - (pad - 11) / k} style={{ fontSize: 10.5 / k }}>{a.thing.name}</text>
          </g>
        );
      })}
    </g>
  );
}

function PinCard({ data, thing, onOpen, onUnpin, onClose }: { data: AppData; thing: Thing; onOpen: () => void; onUnpin: () => void; onClose: () => void }) {
  const path = pathOf(data.items, thing.world, thing.key).slice(0, -1).map((t) => t.name).join(" › ");
  return (
    <div className="pin-card">
      <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
      <div className="title">{iconOf(data.items, thing)} {thing.name}</div>
      {path && <div className="sub">in {path}</div>}
      {thing.summary && <p>{thing.summary}</p>}
      <div className="buttons">
        <button className="primary" onClick={onOpen}>Open</button>
        <button onClick={onUnpin}>Take off this map</button>
      </div>
    </div>
  );
}

// Choose a place not yet on this map, or make a new one, then tap where it goes.
function AddSheet({ data, map, onPick, onClose }: { data: AppData; map: WorldMap; onPick: (key: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [, setChanged] = useState(0);
  const off = notOnMap(data.items, map).filter((t) => t.name.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>Pin a place</h2>
        <input className="filter" placeholder="Find" value={text} onChange={(e) => setText(e.target.value)} />
        {off.length === 0 && <p className="sub">Every place is on this map. Make a new one below.</p>}
        <ul className="list">
          {off.map((t) => (
            <li key={t.key}>
              <button onClick={() => onPick(t.key)}>
                <span className="title">{iconOf(data.items, t)} {t.name}</span>
                <span className="sub">{pathOf(data.items, t.world, t.key).slice(0, -1).map((p) => p.name).join(" › ") || "at the top"}</span>
              </button>
            </li>
          ))}
        </ul>
        <NewPlace data={data} world={map.world} save={async (items) => (await data.setItems(items), setChanged((n) => n + 1))} onMade={onPick} />
      </div>
    </div>
  );
}

// --- Geometry for the view -------------------------------------------------------------------------

function fitView(map: WorldMap, size: { w: number; h: number }): View {
  const k = Math.min(size.w / map.width, size.h / map.height) * 0.94;
  return { k, tx: (size.w - map.width * k) / 2, ty: (size.h - map.height * k) / 2 };
}

function centreOn(p: Point, k: number, size: { w: number; h: number }): View {
  return { k, tx: size.w / 2 - p.x * k, ty: size.h / 2 - p.y * k };
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
