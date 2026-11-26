// World → a map: items pinned on a blank sheet. Drag the sheet to pan, pinch (or the wheel) to
// zoom. Tap a pin, or an area's badge, to select it (tap more for a bulk move); double-tap to open
// it; double-tap empty space for a new item pinned there. Drag a pin to move it (a selected pin
// brings the other selected pins). "+ Item" then tap the sheet to pin one. Undo and redo step
// back through changes to the pins (owner, 25–26 Nov).
// Places holding pinned places show as soft areas around them (worked out, never stored).
// Design: design/world-structure.md §5 (pin things to a map; pins per map in its own coordinates;
// abstract views zoom by containment); spec/pillars/background-and-narrative.md §6 (pin icons from
// the kind; labels from names; in-tool drawing minimal); session-20 notes 3 §0 (world leads on
// desktop, works on the phone).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import type { Thing, WorldMap } from "../../../items/items";
import { areasOn, groupAreasOn, iconOf, notOnMap, placePin, removePin, type Area } from "../../../world/maps";
import { pathOf } from "../../../world/places";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NewPlace } from "./WorldScreen";
import { TextBox } from "./text-box";
import { treeKinds } from "../../../world/places";
import { useUndo } from "./undo";
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, swallowNextClick, tapSlop } from "./gestures";
import { descendantsOf } from "../../../world/places";
import { membersOf } from "../../../world/groups";

type View = { k: number; tx: number; ty: number }; // screen = map × k + t
type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; from: View; moved: boolean }
  | { kind: "pin"; thing: string; start: Point; moved: boolean; moving: string[]; from: Map<string, Point> }
  | { kind: "area"; thing: string; start: Point; from: View; moved: boolean }
  | { kind: "pinch"; startDistance: number; startCentre: Point; from: View }
  | null;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 12;

export function MapScreen({ data, nav, mapKey, focus, place }: { data: AppData; nav: Nav; mapKey: string; focus?: string; place?: string }) {
  const stored = data.items.find((i): i is WorldMap => i.kind === "map" && i.key === mapKey);
  const [map, setMap] = useState<WorldMap | undefined>(stored); // the pins as shown (live while dragging)
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string[]>(focus ? [focus] : []); // pins and areas; several for a bulk move
  const [placing, setPlacing] = useState<string | null>(place ?? null);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<AreasShown>(() => readAreasShown(mapKey));
  const [areasMenu, setAreasMenu] = useState(false);
  const showArea = (next: AreasShown) => (setShown(next), saveAreasShown(mapKey, next));
  const [locked, setLocked] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);
  const lastTap = useRef<{ key: string; at: Point; time: number; before: string[] } | null>(null); // for a double tap ("" = empty space)
  const undo = useUndo("map", map?.world ?? "", () => data.items, async (items) => {
    await data.setItems(items);
    setMap(items.find((i): i is WorldMap => i.kind === "map" && i.key === mapKey)); // undo and redo redraw the pins
  });
  const [newAt, setNewAt] = useState<Point | null>(null); // a double tap here: a new item pinned at this point

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
  // Every change to the pins can be undone (owner, 26 Nov).
  const save = async (next: WorldMap) => {
    setMap(next);
    await undo.apply(data.items.map((i) => (i.key === next.key ? next : i)));
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
    const area = (e.target as Element).closest("[data-area]")?.getAttribute("data-area");
    if (pin && !placing) {
      // A selected pin brings the rest of the selected pins with it.
      const moving = selected.includes(pin) ? selected.filter((k) => map?.pins.some((p) => p.thing === k)) : [pin];
      const from = new Map((map?.pins ?? []).filter((p) => moving.includes(p.thing)).map((p) => [p.thing, { x: p.x, y: p.y }]));
      gesture.current = { kind: "pin", thing: pin, start: local(e), moved: false, moving, from };
    } else if (area && !placing) {
      gesture.current = { kind: "area", thing: area, start: local(e), from: view, moved: false };
    } else {
      gesture.current = { kind: "pan", start: local(e), from: view, moved: false };
    }
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
    } else if (g?.kind === "pan" || g?.kind === "area") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      g.moved = true;
      setView({ k: g.from.k, tx: g.from.tx + at.x - g.start.x, ty: g.from.ty + at.y - g.start.y });
    } else if (g?.kind === "pin") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      if (locked) {
        // Pins locked: a drag that starts on a pin pans instead.
        gesture.current = { kind: "pan", start: g.start, from: view, moved: true };
        return;
      }
      g.moved = true;
      const dx = (at.x - g.start.x) / view.k;
      const dy = (at.y - g.start.y) / view.k;
      setMap((m) => {
        if (!m) return m;
        let next = m;
        for (const [thing, p] of g.from) next = placePin(next, thing, p.x + dx, p.y + dy);
        return next;
      });
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
      else tap(g.thing, local(e));
    } else if (g?.kind === "area" && !g.moved) {
      tap(g.thing, local(e));
    } else if (g?.kind === "pan" && !g.moved) {
      if (placing) {
        const p = toMap(local(e), view);
        await save(placePin(map, placing, p.x, p.y));
        setSelected([placing]);
        setPlacing(null);
      } else tap("", local(e));
    }
  };

  // One tap selects or unselects a pin or area (empty space: clears); a second soon after, close
  // by, opens the item (empty space: a new item there). Owner, 26 Nov.
  const tap = (key: string, at: Point) => {
    const before = lastTap.current;
    if (before && before.key === key && Date.now() - before.time < DOUBLE_TAP_MS && distance(at, before.at) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      setSelected(before.before); // the first tap of a double tap doesn't count as a select
      swallowNextClick();
      if (key) nav.open({ name: "place", key });
      else if (view) setNewAt(toMap(at, view));
      return;
    }
    lastTap.current = { key, at, time: Date.now(), before: selected };
    if (!key) setSelected([]);
    else setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  const wheel = (e: WheelEvent) => {
    if (!view) return;
    const at = local(e);
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    const anchor = toMap(at, view);
    setView({ k, tx: at.x - anchor.x * k, ty: at.y - anchor.y * k });
  };

  // The trees whose areas show (several at once: owner, 26 Nov), the main tree if none chosen yet.
  const trees = treeKinds(data.items, map.world);
  const treesShown = (shown.trees ?? [trees[0]?.key]).filter((k) => trees.some((t) => t.key === k));
  const allAreas = [...treesShown.flatMap((t) => areasOn(data.items, map, t)), ...groupAreasOn(data.items, map)];
  const treeStyle = (tree?: string) => Math.max(0, treesShown.indexOf(tree ?? "")); // 0: the first tree shown, drawn filled

  const placingThing = placing ? things.get(placing) : undefined;

  return (
    <section className="map-screen">
      <div className="map-bar">
        <h1>{map.name}</h1>
        <span className="map-tools">
          <button className="primary" onClick={() => setAdding(true)}>+ Item</button>
          <span className="areas-menu">
            <button className={shown.all ? "tool on" : "tool"} onClick={() => setAreasMenu(!areasMenu)}>Areas ▾</button>
            {areasMenu && (
              <AreasMenu areas={allAreas} shown={shown} onChange={showArea} onClose={() => setAreasMenu(false)} trees={trees.map((t) => ({ key: t.key, name: t.name }))} treesShown={treesShown} />
            )}
          </span>
          <button className={locked ? "tool on" : "tool"} onClick={() => setLocked(!locked)}>{locked ? "Locked" : "Lock"}</button>
          <button className="tool" onClick={() => size && setView(fitView(map, size))}>Fit</button>
          <button className="tool" disabled={!undo.canUndo} onClick={undo.undo} aria-label="Undo">↶</button>
          <button className="tool" disabled={!undo.canRedo} onClick={undo.redo} aria-label="Redo">↷</button>
        </span>
      </div>
      {placingThing && (
        <div className="map-banner">
          Tap the map to place <b>{placingThing.name}</b> <button className="link" onClick={() => setPlacing(null)}>Cancel</button>
        </div>
      )}
      {selected.length === 0 ? (
        <div className="selection-bar empty sub">Tap to select (more for a bulk move) · double-tap to open · double-tap empty space for a new item.</div>
      ) : (
        <SelectionCard
          data={data}
          map={map}
          selected={selected.map((k) => things.get(k)).filter((t): t is Thing => !!t)}
          onOpen={(key) => nav.open({ name: "place", key })}
          onUnpin={async (keys) => {
            let next = map;
            for (const k of keys) next = removePin(next, k);
            await save(next);
            setSelected([]);
          }}
          onSelect={setSelected}
          onClose={() => setSelected([])}
        />
      )}
      <div className="map-wrap" ref={wrap} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.preventDefault()} onWheel={wheel}>
        {size && view && (
          <svg width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={placing ? "placing" : ""}>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              <rect className="map-sheet" x={0} y={0} width={map.width} height={map.height} rx={8 / view.k} />
              {shown.all && <Areas areas={allAreas.filter((a) => !shown.hidden.includes(areaId(a)))} k={view.k} selected={selected} treeStyle={treeStyle} />}
              {map.pins.map((p) => {
                const thing = things.get(p.thing);
                if (!thing) return null;
                return (
                  <g key={p.thing} data-pin={p.thing} transform={`translate(${p.x} ${p.y}) scale(${1 / view.k})`} className={selected.includes(p.thing) ? "pin on" : "pin"}>
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

      {newAt && (
        <NewHere
          data={data}
          world={map.world}
          onMade={async (key) => {
            await save(placePin(map, key, newAt.x, newAt.y));
            setSelected([key]);
            setNewAt(null);
          }}
          onClose={() => setNewAt(null)}
        />
      )}
      {adding && <AddSheet data={data} map={map} onPick={(key) => (setAdding(false), setSelected([]), setPlacing(key))} onClose={() => setAdding(false)} />}

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
        <p className="sub">A drawn map is unreliable for scale: distances come from the links between items, not from where the pins sit. A picture behind the map comes with images.</p>
        <div className="buttons">
          <button className="danger" onClick={async () => {
            if (!confirm(`Remove the map ${map.name}? Its items stay in the world.`)) return;
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
// The first tree shown is drawn as filled shapes; others as dotted outlines in their own colour, so
// where trees cross can be seen on one map.
function Areas({ areas, k, selected, treeStyle }: { areas: Area[]; k: number; selected: string[]; treeStyle: (tree?: string) => number }) {
  const deepest = Math.max(0, ...areas.filter((a) => a.by === "containment").map((a) => a.depth));
  return (
    <g className="areas">
      {areas.map((a) => {
        // Groups sit just round their members (dashed); containment is padded by depth.
        const pad = a.by === "group" ? 20 : 28 + (deepest - a.depth) * 16; // px on screen
        const d = a.outline.map((p, n) => `${n ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";
        const top = a.outline.reduce((best, p) => (p.y < best.y ? p : best), a.outline[0]);
        return (
          <g key={areaId(a)} className={(a.by === "group" ? "area group" : treeStyle(a.tree) > 0 ? `area other tree-${treeStyle(a.tree) % 3}` : `area depth-${a.depth % 4}`) + (selected.includes(a.thing.key) ? " selected" : "")}>
            {a.by === "group" || treeStyle(a.tree) > 0 ? (
              <>
                <path d={d} strokeWidth={(pad * 2) / k} className="group-fill" />
                <path d={roundedOutline(a.outline, pad / k)} strokeWidth={1.5 / k} strokeDasharray={`${5 / k} ${4 / k}`} className="group-edge" />
              </>
            ) : (
              <path d={d} strokeWidth={(pad * 2) / k} />
            )}
            <text x={top.x} y={top.y - (pad - 11) / k} style={{ fontSize: 10.5 / k }}>{a.thing.name}</text>
            {/* A badge to tap, to select the area (owner, 26 Nov); double-tap opens it. */}
            <g data-area={a.thing.key} className="area-badge" transform={`translate(${top.x + (labelWidth(a.thing.name) / 2 + 12) / k} ${top.y - (pad - 7) / k}) scale(${1 / k})`}>
              <circle r={9} />
              <text y={4}>{a.by === "group" ? "◌" : "◉"}</text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

// The edge of a group's area: its outline pushed out by the padding, corners rounded. Each corner gets
// an arc of radius `pad` and the sides are the outline's sides moved outwards.
function roundedOutline(points: Point[], pad: number): string {
  if (points.length === 1) {
    const p = points[0];
    return `M${p.x - pad} ${p.y} a${pad} ${pad} 0 1 0 ${pad * 2} 0 a${pad} ${pad} 0 1 0 ${-pad * 2} 0`;
  }
  // Walk the hull clockwise-or-not: offset each side along its outward normal (away from the centre).
  const centre = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
  const sides = points.map((a, n) => {
    const b = points[(n + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / len;
    let ny = -(b.x - a.x) / len;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - centre.x) * nx + (mid.y - centre.y) * ny < 0) [nx, ny] = [-nx, -ny];
    return { from: { x: a.x + nx * pad, y: a.y + ny * pad }, to: { x: b.x + nx * pad, y: b.y + ny * pad } };
  });
  let d = `M${sides[0].from.x} ${sides[0].from.y}`;
  sides.forEach((side, n) => {
    const next = sides[(n + 1) % sides.length];
    d += ` L${side.to.x} ${side.to.y} A${pad} ${pad} 0 0 ${sweep(side, next)} ${next.from.x} ${next.from.y}`;
  });
  return d + " Z";
}

// Which way round a corner's arc turns, from the turn between one side and the next.
function sweep(side: { from: Point; to: Point }, next: { from: Point; to: Point }): number {
  const cross = (side.to.x - side.from.x) * (next.to.y - next.from.y) - (side.to.y - side.from.y) * (next.to.x - next.from.x);
  return cross > 0 ? 1 : 0;
}

// Roughly how wide an area's label is on screen (10.5px capitals, spaced), to sit its badge after it.
function labelWidth(name: string): number {
  return name.length * 7.6;
}

// An area's id in the Areas menu: a place can show both what it holds and its group members.
function areaId(a: Area): string {
  return a.by === "group" ? `group:${a.thing.key}` : `${a.tree}:${a.thing.key}`;
}

// Which areas a map shows: all of them on or off, and single ones hidden. A view setting kept on this
// device (world-structure §5: view presets are display settings, not world data).
type AreasShown = { all: boolean; hidden: string[]; trees?: string[] }; // trees: whose areas show

function readAreasShown(mapKey: string): AreasShown {
  try {
    const saved = JSON.parse(localStorage.getItem(`worldbuilder.areas.${mapKey}`) ?? "null");
    if (saved && typeof saved.all === "boolean" && Array.isArray(saved.hidden)) return saved;
  } catch {
    // no storage (private window): fall back to showing every area
  }
  return { all: true, hidden: [] };
}

function saveAreasShown(mapKey: string, shown: AreasShown) {
  try {
    localStorage.setItem(`worldbuilder.areas.${mapKey}`, JSON.stringify(shown));
  } catch {
    // not kept: it still applies until the map is closed
  }
}

function AreasMenu({ areas, shown, onChange, onClose, trees, treesShown }: { areas: Area[]; shown: AreasShown; onChange: (s: AreasShown) => void; onClose: () => void; trees: { key: string; name: string }[]; treesShown: string[] }) {
  const toggle = (key: string) => onChange({ ...shown, hidden: shown.hidden.includes(key) ? shown.hidden.filter((k) => k !== key) : [...shown.hidden, key] });
  const toggleTree = (key: string) => onChange({ ...shown, trees: treesShown.includes(key) ? treesShown.filter((k) => k !== key) : [...treesShown, key] });
  // One folding list per tree shown, and one for groups, so the menu stays short (owner, 26 Nov).
  const sections = [
    ...treesShown.map((t) => ({ id: t, title: trees.find((x) => x.key === t)?.name ?? t, list: areas.filter((a) => a.by === "containment" && a.tree === t) })),
    { id: "group", title: "Groups", list: areas.filter((a) => a.by === "group") },
  ].filter((sec) => sec.list.length > 0);
  return (
    <>
      <div className="menu-catcher" onClick={onClose} />
      <div className="filter-panel areas-panel">
        <label className="choice"><input type="checkbox" checked={shown.all} onChange={() => onChange({ ...shown, all: !shown.all })} /> <b>Show areas</b></label>
        {trees.length > 1 && (
          <>
            <div className="sub menu-heading">Trees</div>
            <div className="chips tree-chips">
              {trees.map((t) => (
                <button key={t.key} className={treesShown.includes(t.key) ? "on" : ""} onClick={() => toggleTree(t.key)}>{t.name}</button>
              ))}
            </div>
          </>
        )}
        {areas.length === 0 && <p className="sub">No areas: an item shows as one once something inside it is pinned here.</p>}
        {sections.map((sec) => (
          <details key={sec.id} className="menu-section">
            <summary className="sub menu-heading">{sec.title} ({sec.list.length})</summary>
            {sec.list.map((a) => (
              <label key={areaId(a)} className="choice" style={{ paddingLeft: 8 + a.depth * 16, opacity: shown.all ? 1 : 0.5 }}>
                <input type="checkbox" disabled={!shown.all} checked={!shown.hidden.includes(areaId(a))} onChange={() => toggle(areaId(a))} /> {a.thing.name}
              </label>
            ))}
          </details>
        ))}
      </div>
    </>
  );
}

// What's selected: one item's card (Open; take it off the map; select what's inside it), or a count
// for a bulk move (owner, 26 Nov: "I want to be able to do bulk moves").
function SelectionCard({ data, map, selected, onOpen, onUnpin, onSelect, onClose }: { data: AppData; map: WorldMap; selected: Thing[]; onOpen: (key: string) => void; onUnpin: (keys: string[]) => void; onSelect: (keys: string[]) => void; onClose: () => void }) {
  const pinned = selected.filter((t) => map.pins.some((p) => p.thing === t.key));
  // Inside the selection: what each holds (any depth, main tree) and its group members, pinned here.
  const inside = [...new Set(selected.flatMap((t) => [...descendantsOf(data.items, map.world, t.key), ...membersOf(data.items, map.world, t.key).map((m) => m.thing)]).map((t) => t.key))]
    .filter((k) => map.pins.some((p) => p.thing === k) && !selected.some((t) => t.key === k));
  const one = selected.length === 1 ? selected[0] : null;
  const path = one ? pathOf(data.items, one.world, one.key).slice(0, -1).map((t) => t.name).join(" › ") : "";
  return (
    <div className="selection-bar">
      <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
      {one ? (
        <>
          <div className="title">{iconOf(data.items, one)} {one.name}</div>
          {path && <div className="sub">in {path}</div>}
        </>
      ) : (
        <div className="title">{selected.length} selected</div>
      )}
      <div className="selection-buttons">
        {one && <button className="primary" onClick={() => onOpen(one.key)}>Open</button>}
        {inside.length > 0 && <button onClick={() => onSelect([...selected.map((t) => t.key), ...inside])}>Select what's inside ({inside.length})</button>}
        {pinned.length > 0 && <button onClick={() => onUnpin(pinned.map((t) => t.key))}>Take {pinned.length > 1 ? `${pinned.length} ` : ""}off this map</button>}
      </div>
    </div>
  );
}

// Choose a place not yet on this map, or make a new one, then tap where it goes.
// A new item, made where the map was double-tapped: its name (and where it sits), then pinned there.
function NewHere({ data, world, onMade, onClose }: { data: AppData; world: string; onMade: (key: string) => void; onClose: () => void }) {
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <NewPlace data={data} world={world} save={(items) => data.setItems(items)} onMade={onMade} autoFocus />
      </div>
    </div>
  );
}

function AddSheet({ data, map, onPick, onClose }: { data: AppData; map: WorldMap; onPick: (key: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [, setChanged] = useState(0);
  const off = notOnMap(data.items, map).filter((t) => t.name.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>Pin an item</h2>
        <input className="filter" placeholder="Find" value={text} onChange={(e) => setText(e.target.value)} />
        {off.length === 0 && <p className="sub">Every item is on this map. Make a new one below.</p>}
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
