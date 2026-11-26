// World → Diagram: a tree drawn as boxes, across or down, arranged by hand (owner, 25–26 Nov).
// Tap a box to select it (tap more for a bulk move); double-tap it to open the item; double-tap
// empty space for a new item there (inside the one selected box, if one is).
// Two ways to drag (everything selected moves together if the box dragged is selected):
//   - Arrange: move boxes where you like, each branch following or not; kept on the world;
//   - Move inside: drop on another box to move inside, on the world to put them at the top.
// A container's round button folds its branch away (and shows how many are hidden).
// Undo and Redo step back through the moves. Drag the background to pan; pinch or wheel to zoom.
// Design: design/world-structure.md §3 (one parent at a time, no loops: a drop that would make a loop
// is refused), §5 (abstract views laid out by containment); spec/session-20-notes-3.md §0.1 (a
// canvas as another view on the same structure). Layout: src/world/diagram.ts.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { descendantsOf, hideHere, looseIn, setParent, treeKinds } from "../../../world/places";
import { groupOutlines, treeOutlines, type Outline } from "../../../world/outlines";
import { colourOf } from "./area-colours";
import { itemsWithMisfits, refusal } from "../../../world/kinds";
import { iconOf } from "../../../world/maps";
import { worldOf } from "../../../world/world";
import { arrangedLayout, boxesThatMove, hasHandPlacing, moveBoxes, NODE_H, NODE_W, ROOT, tidyLayout, type Box, type Direction } from "../../../world/diagram";
import { TreePicker, useChosenTree } from "./tree-picker";
import { useKept, useRemembered } from "./remembered";
import { HiddenNote, NewPlace, type Part } from "./WorldScreen";
import { useUndo } from "./undo";
import { GroupPopup } from "./GroupPopup";
import { DOUBLE_TAP_MS, swallowNextClick, tapSlop } from "./gestures";


type DragMode = "arrange" | "inside";
type View = { k: number; tx: number; ty: number };
type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; from: View; moved: boolean }
  | { kind: "box"; key: string; start: Point; moved: boolean }
  | { kind: "fold"; key: string; start: Point; from: View; moved: boolean }
  | { kind: "pinch"; startDistance: number; startCentre: Point; from: View }
  | null;
// A drag under way: which boxes move and by how much (arrange), or where it would drop (inside).
type Drag = { key: string; moving: string[]; dx: number; dy: number; over: string | null };

export function TreeDiagram({ data, nav, world, save }: Part) {
  const [tree, setTree] = useChosenTree(data, world);
  const [direction, setDirection] = useKept<Direction>("diagram-direction", "across");
  const [mode, setMode] = useKept<DragMode>("diagram-drag", "arrange");
  const [withBranch, setWithBranch] = useKept("diagram-branch", true);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const flagged = itemsWithMisfits(data.items, world, tree); // in one of this tree's links that doesn't fit
  const looseKeys = new Set(looseIn(data.items, world, tree).map((t) => t.key));
  const looseSelected = selected.filter((k) => looseKeys.has(k));
  const [newAt, setNewAt] = useState<Point | null>(null); // a double tap on empty space: a new item here
  const lastTap = useRef<{ key: string; time: number; before: string[] } | null>(null);
  const undo = useUndo("diagram", world, () => data.items, save);
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);
  const [foldedList, setFoldedList] = useRemembered<string[]>(`${world}|folded|${tree}`, []);
  const folded = new Set(foldedList);
  const toggleFold = (key: string) => setFoldedList(folded.has(key) ? foldedList.filter((k) => k !== key) : [...foldedList, key]);
  const boxes = arrangedLayout(data.items, world, tree, direction, folded);
  // Outlines of groups and of other trees' containers round the boxes they hold (owner, 26 Nov).
  const [outlined, setOutlined] = useKept<string[]>(`diagram-outlines|${world}`, []); // "groups" and tree keys
  const [outlineMenu, setOutlineMenu] = useState(false);
  const otherTrees = treeKinds(data.items, world).filter((k) => k.key !== tree);
  const [hiddenOutlines, setHiddenOutlines] = useKept<string[]>(`diagram-outlines-hidden|${world}`, []); // single ones switched off
  const [outlineHover, setOutlineHover] = useState<string | null>(null);
  // Every outline there could be; those drawn (their kind on, not switched off); one pointed at is drawn too.
  const everyOutline = [...groupOutlines(data.items, world), ...otherTrees.flatMap((k) => treeOutlines(data.items, world, k.key))];
  const categoryOf = (o: Outline) => (o.by === "group" ? "groups" : o.tree!);
  const drawnOutlines = everyOutline.filter((o) => outlined.includes(categoryOf(o)) && !hiddenOutlines.includes(outlineId(o)));
  const hovered = everyOutline.find((o) => outlineId(o) === outlineHover);
  const outlines = hovered && !drawnOutlines.includes(hovered) ? [...drawnOutlines, hovered] : drawnOutlines;
  const toggleOutline = (id: string) => setOutlined(outlined.includes(id) ? outlined.filter((o) => o !== id) : [...outlined, id]);
  // A row in the key switches one outline on or off, as the menu does (owner, 26 Nov).
  const toggleOne = (o: Outline) => {
    const id = outlineId(o);
    if (drawnOutlines.includes(o)) return setHiddenOutlines([...hiddenOutlines, id]);
    if (outlined.includes(categoryOf(o))) return setHiddenOutlines(hiddenOutlines.filter((h) => h !== id));
    // Its kind was off: turn the kind on with only this one showing.
    const others = everyOutline.filter((x) => categoryOf(x) === categoryOf(o) && x !== o).map(outlineId);
    setHiddenOutlines([...hiddenOutlines.filter((h) => h !== id && !others.includes(h)), ...others]);
    setOutlined([...outlined, categoryOf(o)]);
  };
  const outlineColour = (o: Outline) => colourOf(o.thing, o.by, o.by === "group" ? 0 : otherTrees.findIndex((k) => k.key === o.tree) + 1, 0);
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

  // The whole diagram in view, but never smaller than 60% so names stay readable.
  const fit = (): View | null => {
    if (!size || boxes.length === 0) return null;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const width = Math.max(...boxes.map((b) => b.x)) + NODE_W - left;
    const height = Math.max(...boxes.map((b) => b.y)) + NODE_H - top;
    const k = clamp(Math.min((size.w - 24) / width, (size.h - 24) / height), 0.6, 1);
    const fits = width * k <= size.w - 24 && height * k <= size.h - 24;
    if (fits) return { k, tx: (size.w - width * k) / 2 - left * k, ty: 12 - top * k };
    // Too big for the screen: start at the world's box (the top of the tree), to be panned from.
    const root = boxes.find((b) => b.key === ROOT)!;
    return direction === "down"
      ? { k, tx: size.w / 2 - (root.x + NODE_W / 2) * k, ty: 12 - root.y * k }
      : { k, tx: 12 - root.x * k, ty: size.h / 2 - (root.y + NODE_H / 2) * k };
  };
  useEffect(() => {
    if (size && !view) setView(fit());
  }, [size, view]);
  useEffect(() => setView(fit()), [direction, tree]); // a new shape: start from the whole of it

  const local = (e: { clientX: number; clientY: number }): Point => {
    const box = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const toDiagram = (p: Point, v: View): Point => ({ x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k });
  const boxAt = (p: Point, skip: string): Box | undefined => boxes.find((b) => b.key !== skip && p.x >= b.x && p.x <= b.x + NODE_W && p.y >= b.y && p.y <= b.y + NODE_H);

  // Where a box may be moved inside: not itself or anything it holds.
  const canDrop = (dragged: string, target: string | undefined): boolean => {
    if (!target || target === dragged) return false;
    if (target === ROOT) return true;
    if (tree && refusal(data.items, world, tree, "to", target)) return false; // e.g. a Person holds nothing
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
    const fold = (e.target as Element).closest("[data-fold]")?.getAttribute("data-fold");
    if (fold) {
      gesture.current = { kind: "fold", key: fold, start: local(e), from: view, moved: false };
      return;
    }
    const node = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
    gesture.current = node && node !== ROOT ? { kind: "box", key: node, start: local(e), moved: false } : { kind: "pan", start: local(e), from: view, moved: false };
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
    } else if (g?.kind === "pan" || g?.kind === "fold") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      g.moved = true;
      setView({ k: g.from.k, tx: g.from.tx + at.x - g.start.x, ty: g.from.ty + at.y - g.start.y });
    } else if (g?.kind === "box") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      g.moved = true;
      const dx = (at.x - g.start.x) / view.k;
      const dy = (at.y - g.start.y) / view.k;
      const dragged = selected.includes(g.key) ? selected : [g.key]; // a selected box brings the rest of the selection
      if (mode === "arrange") {
        const moving = [...new Set(dragged.flatMap((k) => boxesThatMove(data.items, world, tree, k, withBranch)))];
        setDrag({ key: g.key, moving, dx, dy, over: null });
      } else {
        const target = boxAt(toDiagram(at, view), g.key)?.key;
        const fits = dragged.every((k) => canDrop(k, target)) && !dragged.includes(target ?? "");
        setDrag({ key: g.key, moving: dragged, dx, dy, over: fits ? target! : null });
      }
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
    if (g?.kind === "pan" && !g.moved && view) return tapSpace(toDiagram(local(e), view));
    if (g?.kind === "fold" && !g.moved) return toggleFold(g.key);
    if (g?.kind !== "box") return;
    if (!g.moved) return tapBox(g.key);
    const done = drag;
    setDrag(null);
    if (!done) return;
    if (mode === "arrange") {
      await undo.apply(moveBoxes(data.items, world, tree, direction, done.moving, done.dx, done.dy));
      return setSelected([]); // a move is done: start afresh (owner, 26 Nov)
    }
    if (!done.over) return; // dropped nowhere useful: they go back where they were
    let items = data.items;
    for (const key of done.moving) items = setParent(items, world, key, done.over === ROOT ? null : done.over, tree).items;
    await undo.apply(items);
    setSelected([]);
  };

  // One tap selects or unselects; a second on the same box soon after opens it.
  const tapBox = (key: string) => {
    const before = lastTap.current;
    if (before && before.key === key && Date.now() - before.time < DOUBLE_TAP_MS) {
      lastTap.current = null;
      setSelected(before.before); // the first tap of a double tap doesn't count as a select
      swallowNextClick();
      return nav.open({ name: "place", key });
    }
    lastTap.current = { key, time: Date.now(), before: selected };
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  // One tap on empty space clears the selection; a double tap makes a new item there.
  const tapSpace = (at: Point) => {
    const before = lastTap.current;
    if (before && before.key === "" && Date.now() - before.time < DOUBLE_TAP_MS) {
      lastTap.current = null;
      setSelected(before.before);
      swallowNextClick();
      return setNewAt(at);
    }
    lastTap.current = { key: "", time: Date.now(), before: selected };
    setSelected([]);
  };

  // A new item from a double tap: inside the one selected box (in this tree), placed where tapped.
  const madeHere = async (key: string) => {
    let items = data.items;
    const inside = selected.length === 1 ? selected[0] : null;
    if (inside) items = setParent(items, world, key, inside, tree).items;
    const box = arrangedLayout(items, world, tree, direction).find((b) => b.key === key);
    if (box && newAt) items = moveBoxes(items, world, tree, direction, [key], newAt.x - NODE_W / 2 - box.x, newAt.y - NODE_H / 2 - box.y);
    await save(items);
    setNewAt(null);
    setSelected([key]);
  };

  const wheel = (e: WheelEvent) => {
    if (!view) return;
    const at = local(e);
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), 0.2, 3);
    const anchor = toDiagram(at, view);
    setView({ k, tx: at.x - anchor.x * k, ty: at.y - anchor.y * k });
  };

  // Where a box is drawn: moved along with an arrange drag, or still (inside: a ghost follows).
  const drawnAt = (b: Box): Point => (drag && mode === "arrange" && drag.moving.includes(b.key) ? { x: b.x + drag.dx, y: b.y + drag.dy } : { x: b.x, y: b.y });
  const edge = (parent: Point, child: Point): string => {
    if (direction === "across") {
      const [x1, y1, x2, y2] = [parent.x + NODE_W, parent.y + NODE_H / 2, child.x, child.y + NODE_H / 2];
      return `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
    }
    const [x1, y1, x2, y2] = [parent.x + NODE_W / 2, parent.y + NODE_H, child.x + NODE_W / 2, child.y];
    return `M${x1} ${y1} C${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
  };
  const worldName = worldOf(data.items, world)?.name ?? "World";
  const label = (b: Box) => (b.thing ? `${iconOf(data.items, b.thing)} ${b.thing.name}` : worldName);
  const handPlaced = hasHandPlacing(data.items, world, tree, direction);

  return (
    <>
      <div className="diagram-bar">
        <nav className="segments small">
          <button className={direction === "across" ? "on" : ""} onClick={() => setDirection("across")}>Across</button>
          <button className={direction === "down" ? "on" : ""} onClick={() => setDirection("down")}>Down</button>
        </nav>
        <nav className="segments small">
          <button className={mode === "arrange" ? "on" : ""} onClick={() => setMode("arrange")}>Arrange</button>
          <button className={mode === "inside" ? "on" : ""} onClick={() => setMode("inside")}>Move inside</button>
        </nav>
        {mode === "arrange" && (
          <label className="choice"><input type="checkbox" checked={withBranch} onChange={() => setWithBranch(!withBranch)} /> Branch follows</label>
        )}
        <TreePicker data={data} world={world} tree={tree} onChoose={setTree} />
        <span className="map-tools outlines-menu">
          <button className={outlined.length ? "tool on" : "tool"} onClick={() => setOutlineMenu(!outlineMenu)}>Outlines ▾</button>
          {outlineMenu && (
            <>
              <div className="menu-catcher" onClick={() => setOutlineMenu(false)} />
              <div className="filter-panel areas-panel">
                <label className="choice"><input type="checkbox" checked={outlined.includes("groups")} onChange={() => toggleOutline("groups")} /> Groups (dashed)</label>
                {otherTrees.map((k, n) => (
                  <label key={k.key} className="choice"><input type="checkbox" checked={outlined.includes(k.key)} onChange={() => toggleOutline(k.key)} /> <span className={`tree-swatch tree-${n % 3}`} /> {k.name} (dotted)</label>
                ))}
              </div>
            </>
          )}
        </span>
        <span className="map-tools">
          <button className="tool" disabled={!undo.canUndo} onClick={undo.undo} aria-label="Undo">↶ Undo</button>
          <button className="tool" disabled={!undo.canRedo} onClick={undo.redo} aria-label="Redo">↷ Redo</button>
          {handPlaced && <button className="tool" onClick={() => confirm("Back to the automatic layout for this tree, this way round?") && undo.apply(tidyLayout(data.items, world, tree, direction))}>Tidy</button>}
          <button className="tool" onClick={() => setView(fit())}>Fit</button>
        </span>
      </div>
      {tree && <HiddenNote data={data} nav={nav} world={world} tree={tree} />}
      {/* What's selected, in a bar of its own that keeps its height (owner, 26 Nov: the Group button
          was cut off in the hint line until something else changed). */}
      <div className="selection-bar diagram-selection">
        {selected.length > 0 ? (
          <>
            <div className="title">{selected.length} selected <span className="sub">· drag one to move them all</span></div>
            <div className="selection-buttons">
              {selected.length > 1 && <button className="primary" onClick={() => setGrouping(true)}>Group / move into…</button>}
              {tree && looseSelected.length > 0 && (
                <button onClick={async () => {
                  let items = data.items;
                  for (const k of looseSelected) items = hideHere(items, tree, k, true);
                  await undo.apply(items);
                  setSelected([]);
                }}>Hide {looseSelected.length} loose from this tree</button>
              )}
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          </>
        ) : (
          <span className="sub">
            Tap to select (more for a bulk move) · double-tap to open · double-tap empty space for a new item ·{" "}
            {mode === "arrange" ? (withBranch ? "branches follow" : "boxes move on their own") : "drop onto a box to move inside, onto the world for the top"}
          </span>
        )}
      </div>
      <div className="map-layout">
      <div className="map-wrap diagram-wrap" ref={wrap} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.preventDefault()} onWheel={wheel}>
        {size && view && (
          <svg width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {/* Each outlined member's box gets a border (offset per outline, so several nest), joined by a
                  line to the next member, the name on the first: no shape round boxes that aren't in it. */}
              {outlines.map((o, i) => {
                const members = boxes.filter((b) => o.members.includes(b.key) || b.key === o.thing.key).map(drawnAt);
                if (members.length === 0) return null;
                const gap = 4 + (i % 4) * 4;
                const centres = members.map((p) => ({ x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 }));
                const n = otherTrees.findIndex((k) => k.key === o.tree);
                return (
                  <g key={outlineId(o)} className={(o.by === "group" ? "outline group" : `outline tree-${n % 3}`) + (outlineHover === outlineId(o) ? " lit" : "")} style={{ color: outlineColour(o) }}>
                    {centres.length > 1 && <path className="outline-join" d={centres.map((p, j) => `${j ? "L" : "M"}${p.x} ${p.y}`).join(" ")} />}
                    {members.map((p, j) => <rect key={j} x={p.x - gap} y={p.y - gap} width={NODE_W + gap * 2} height={NODE_H + gap * 2} rx={10} />)}
                    <text x={members[0].x - gap + 2} y={members[0].y - gap - 3}>{o.thing.name}</text>
                  </g>
                );
              })}
              {boxes.filter((b) => b.parent).map((b) => (
                <path key={`edge-${b.key}`} className="diagram-edge" d={edge(drawnAt(byKey.get(b.parent!)!), drawnAt(b))} />
              ))}
              {boxes.map((b) => {
                const p = drawnAt(b);
                const classes = ["diagram-node", b.key === ROOT ? "root" : "", flagged.has(b.key) ? "misfit" : "", selected.includes(b.key) ? "selected" : "", drag?.moving.includes(b.key) ? (mode === "arrange" ? "moving" : "dragging") : "", drag?.over === b.key ? "target" : ""];
                return (
                  <g key={b.key} data-node={b.key} transform={`translate(${p.x} ${p.y})`} className={classes.join(" ")}>
                    <rect width={NODE_W} height={NODE_H} rx={8} />
                    <text x={10} y={NODE_H / 2 + 5}>{clip(label(b), 17)}</text>
                    {b.holds > 0 && b.key !== ROOT && (
                      // Fold or unfold what it holds; folded, how many are hidden.
                      <g data-fold={b.key} className={b.hidden ? "fold-toggle folded" : "fold-toggle"} transform={direction === "across" ? `translate(${NODE_W} ${NODE_H / 2})` : `translate(${NODE_W / 2} ${NODE_H})`}>
                        <circle r={b.hidden ? 12 : 9} />
                        <text y={4}>{b.hidden ? `+${b.hidden}` : "–"}</text>
                      </g>
                    )}
                  </g>
                );
              })}
              {drag && mode === "inside" && (
                <g className="diagram-node ghost" transform={`translate(${byKey.get(drag.key)!.x + drag.dx} ${byKey.get(drag.key)!.y + drag.dy})`}>
                  <rect width={NODE_W} height={NODE_H} rx={8} />
                  <text x={10} y={NODE_H / 2 + 5}>{clip(label(byKey.get(drag.key)!), 17)}</text>
                </g>
              )}
            </g>
          </svg>
        )}
      </div>
      <OutlineKey everyOutline={everyOutline} drawn={drawnOutlines} hover={outlineHover} onToggle={toggleOne} onHover={setOutlineHover} colour={outlineColour} trees={otherTrees.map((k) => ({ key: k.key, name: k.name }))} />
      </div>
      {grouping && (
        <GroupPopup
          data={data}
          world={world}
          selected={selected}
          tree={tree}
          apply={async (items) => {
            await undo.apply(items);
            setSelected([]);
          }}
          onClose={() => setGrouping(false)}
        />
      )}
      {newAt && (
        <div className="popup-back" onClick={() => setNewAt(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <button className="link popup-close" aria-label="Close" onClick={() => setNewAt(null)}>✕</button>
            {selected.length === 1 && <p className="sub">Inside {byKey.get(selected[0])?.thing?.name}.</p>}
            <NewPlace data={data} world={world} save={(items) => data.setItems(items)} onMade={madeHere} autoFocus noPlacePicker={selected.length === 1} />
          </div>
        </div>
      )}
    </>
  );
}

function outlineId(o: Outline): string {
  return `${o.by}|${o.tree ?? ""}|${o.thing.key}`;
}

// The key beside the Diagram (owner, 26 Nov: "a key would be nice … the same layout and options as on
// maps"): every outline there could be, by groups and by tree, each with a dot in its colour. Tapping
// a row switches it on or off; with a mouse, pointing at one picks it out on the Diagram.
function OutlineKey({ everyOutline, drawn, hover, onToggle, onHover, colour, trees }: { everyOutline: Outline[]; drawn: Outline[]; hover: string | null; onToggle: (o: Outline) => void; onHover: (id: string | null) => void; colour: (o: Outline) => string; trees: { key: string; name: string }[] }) {
  if (everyOutline.length === 0) return null;
  const sections = [
    { id: "groups", title: "Groups (dashed)", list: everyOutline.filter((o) => o.by === "group") },
    ...trees.map((t) => ({ id: t.key, title: `${t.name} (dotted)`, list: everyOutline.filter((o) => o.tree === t.key) })),
  ].filter((sec) => sec.list.length > 0);
  return (
    <aside className="area-list">
      <div className="sub menu-heading">Key · tap to switch on or off</div>
      {sections.map((sec) => (
        <details key={sec.id} open={sec.list.some((o) => drawn.includes(o))}>
          <summary className="sub menu-heading">{sec.title} ({sec.list.filter((o) => drawn.includes(o)).length} of {sec.list.length})</summary>
          <ul className="plain">
            {sec.list.map((o) => (
              <li key={outlineId(o)}>
                <button
                  className={"area-row" + (hover === outlineId(o) ? " lit" : "") + (drawn.includes(o) ? " on" : "")}
                  onClick={() => onToggle(o)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && onHover(outlineId(o))}
                  onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
                >
                  <span className={o.by === "group" ? "area-dot dashed" : "area-dot dotted"} style={{ background: drawn.includes(o) ? colour(o) : "transparent", borderColor: colour(o) }} />
                  {o.thing.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
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
