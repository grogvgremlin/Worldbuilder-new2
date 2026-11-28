// World → Diagram: a tree drawn as boxes, across or down, arranged by hand (owner, 25–26 Nov).
// Tap a box to select it (tap more for a bulk move); double-tap it to open the item; double-tap
// empty space for a new item there (inside the one selected box, if one is).
// Two ways to drag (everything selected moves together if the box dragged is selected):
//   - Arrange: move boxes where you like, each branch following or not; kept on the world;
//   - Move inside: the same, and dropped on another box they move inside it (on the world's box: to
//     the top). Dropped on empty space they stay where dropped, as in Arrange (owner, 27 Nov: "move
//     inside should just allow holding but not stop arrangement").
//   - Connect: the same, but dropped on another box it connects them instead (owner, 27 Nov: "a third mode
//     … same as move, but just creates a link"): the Join choices open, the dragged box first; the
//     boxes go back where they were. Dropped on empty space they stay where dropped.
// A container's round button folds its branch away (and shows how many are hidden).
// Undo and Redo step back through the moves. Drag the background to pan; pinch or wheel to zoom.
// Design: design/world-structure.md §3 (one parent at a time, no loops: a drop that would make a loop
// is refused), §5 (abstract views laid out by containment); spec/session-20-notes-3.md §0.1 (a
// canvas as another view on the same structure). Layout: src/world/diagram.ts.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { bringIntoScope, descendantsOf, outOfScope, pathOf, removeFromScope, setParent, treeKinds } from "../../../world/places";
import { networkOutOfScope } from "../../../world/network";
import { join, plainLinks as connectorsOf, removeLink } from "../../../world/links";
import { ScopePanel } from "./scope-panel";
import { groupOutlines, treeOutlines, type Outline } from "../../../world/outlines";
import { colourOf } from "./area-colours";
import { OverlayList, OverlayMenu, type OverlayRow, type OverlaySet } from "./overlays";
import { itemsWithMisfits, refusal } from "../../../world/kinds";
import { iconOf } from "../../../world/maps";
import { linkKindsIn, worldOf } from "../../../world/world";
import { arrangedLayout, boxesThatMove, hasHandPlacing, moveBoxes, NODE_H, NODE_W, ROOT, tidyLayout, type Box, type Direction } from "../../../world/diagram";
import { TreePicker, useChosenTree } from "./tree-picker";
import { useKept, useRemembered } from "./remembered";
import { NewPlace, type Part } from "./WorldScreen";
import { useUndo } from "./undo";
import { GroupPopup } from "./GroupPopup";
import { JoinPopup } from "./JoinPopup";
import { ContainerBands, containerBands, containerRowId, LINK_CONTAINERS_SET, linkContainerSet, linkContainersIn, LinkBar, LinkContainerPopup, LinkLines, linkLines, linkRowId, LINKS_SET, linkSet } from "./link-lines";
import { plainLinks } from "../../../world/links";
import { isNetwork } from "../../../world/network";
import { selectedLook } from "./selected-look";
import { DOUBLE_TAP_MS, swallowNextClick, tapSlop } from "./gestures";


type DragMode = "arrange" | "inside" | "join";
type View = { k: number; tx: number; ty: number };
type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; from: View; moved: boolean }
  | { kind: "box"; key: string; start: Point; moved: boolean }
  | { kind: "fold"; key: string; start: Point; from: View; moved: boolean }
  | { kind: "pinch"; startDistance: number; startCentre: Point; from: View }
  | { kind: "link"; link: string; start: Point; from: View; moved: boolean }
  | null;
// A drag under way: the boxes dragged, those drawn moving (with their branches, if they follow), by
// how much, and (Move inside) the box it would drop into, or one it's over that can't take it.
type Drag = { key: string; dragged: string[]; moving: string[]; dx: number; dy: number; over: string | null; refused: string | null };

export function TreeDiagram({ data, nav, world, save }: Part) {
  const [tree, setTree] = useChosenTree(data, world, true);
  // A network (a connection link kind) instead of a tree (owner, 27 Nov): no world box, no branches,
  // nothing to move inside; its own links drawn between the boxes.
  const network = isNetwork(data.items, world, tree);
  const [direction, setDirection] = useKept<Direction>("diagram-direction", "across");
  const [keptMode, setMode] = useKept<DragMode>("diagram-drag", "arrange");
  const mode: DragMode = network && keptMode === "inside" ? "arrange" : keptMode;
  const [withBranch, setWithBranch] = useKept("diagram-branch", true);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [joining, setJoining] = useState<[string, string] | null>(null); // two items to join, in order (owner, 27 Nov)
  const [pickedLinks, setPickedLinks] = useState<string[]>([]); // links tapped (several, as items: owner, 28 Nov)
  const [linkContainer, setLinkContainer] = useState(false); // a link tapped on the Diagram
  const [linksShown, setLinksShown] = useKept(`diagram-links|${world}`, true); // the Links set
  const [containersShown, setContainersShown] = useKept(`diagram-link-containers|${world}`, true); // the Made of links set
  const flagged = itemsWithMisfits(data.items, world, tree); // in one of this tree's links that doesn't fit
  // Scope (owner, 28 Nov): a network's workspace holds items brought in to be connected (for now,
  // not stored); the Out of scope panel shows what the view would take but isn't in it.
  const [workspaces, setWorkspaces] = useRemembered<Record<string, string[]>>(`${world}|workspaces`, {});
  const workspace = (network && tree ? workspaces[tree] : undefined) ?? [];
  const setWorkspace = (next: string[]) => tree && setWorkspaces({ ...workspaces, [tree]: next });
  const [scopeShown, setScopeShown] = useKept(`diagram-scope|${world}`, false);
  const [scopePicked, setScopePicked] = useState<string[]>([]);
  const outside = tree ? (network ? networkOutOfScope(data.items, world, tree, workspace) : outOfScope(data.items, world, tree)) : [];
  // Carrying items out of the panel onto the diagram: where the pointer is, until let go.
  const [carry, setCarry] = useState<{ keys: string[]; at: { x: number; y: number }; moved: boolean } | null>(null);
  const [newAt, setNewAt] = useState<Point | null>(null); // a double tap on empty space: a new item here
  const lastTap = useRef<{ key: string; time: number; before: string[] } | null>(null);
  const undo = useUndo(data, world, save);
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>(null);
  const [foldedList, setFoldedList] = useRemembered<string[]>(`${world}|folded|${tree}`, []);
  const folded = new Set(foldedList);
  const toggleFold = (key: string) => setFoldedList(folded.has(key) ? foldedList.filter((k) => k !== key) : [...foldedList, key]);
  const boxes = arrangedLayout(data.items, world, tree, direction, folded, workspace);
  // Outlines of groups and of other trees' containers round the boxes they hold (owner, 26 Nov).
  const [outlined, setOutlined] = useKept<string[]>(`diagram-outlines|${world}`, []); // "groups" and tree keys
  const [outlineMenu, setOutlineMenu] = useState(false);
  const otherTrees = treeKinds(data.items, world).filter((k) => k.key !== tree);
  const [hiddenOutlines, setHiddenOutlines] = useKept<string[]>(`diagram-outlines-hidden|${world}`, []); // single ones switched off
  const [outlineHover, setOutlineHover] = useState<string | null>(null);
  // Every outline there could be; those drawn (their kind on, not switched off); one pointed at is drawn too.
  const everyOutline = [...groupOutlines(data.items, world), ...otherTrees.flatMap((k) => treeOutlines(data.items, world, k.key))];
  const categoryOf = (o: Outline) => (o.by === "group" ? "groups" : o.tree!);
  const [outlinesAll, setOutlinesAll] = useKept(`diagram-outlines-all|${world}`, true); // "Show outlines"
  const drawnOutlines = outlinesAll ? everyOutline.filter((o) => outlined.includes(categoryOf(o)) && !hiddenOutlines.includes(outlineId(o))) : [];
  const hovered = everyOutline.find((o) => outlineId(o) === outlineHover);
  const outlines = hovered && !drawnOutlines.includes(hovered) ? [...drawnOutlines, hovered] : drawnOutlines;
  const toggleOutline = (id: string) => setOutlined(outlined.includes(id) ? outlined.filter((o) => o !== id) : [...outlined, id]);
  // A row in the key switches one outline on or off, as the menu does (owner, 26 Nov).
  const toggleOne = (o: Outline) => {
    const id = outlineId(o);
    if (drawnOutlines.includes(o)) return setHiddenOutlines([...hiddenOutlines, id]);
    if (!outlinesAll) setOutlinesAll(true);
    if (outlined.includes(categoryOf(o))) return setHiddenOutlines(hiddenOutlines.filter((h) => h !== id));
    // Its kind was off: turn the kind on with only this one showing.
    const others = everyOutline.filter((x) => categoryOf(x) === categoryOf(o) && x !== o).map(outlineId);
    setHiddenOutlines([...hiddenOutlines.filter((h) => h !== id && !others.includes(h)), ...others]);
    setOutlined([...outlined, categoryOf(o)]);
  };
  const outlineColour = (o: Outline) => colourOf(o.thing, o.by, o.by === "group" ? 0 : otherTrees.findIndex((k) => k.key === o.tree) + 1, 0);
  // The sets for the shared filter menu and key: groups, then each other tree (as on maps).
  const outlineRow = (o: Outline): OverlayRow => ({ id: outlineId(o), name: o.thing.name, key: o.thing.key, opens: "place", depth: 0, on: drawnOutlines.includes(o), colour: outlineColour(o), line: o.by === "group" ? "dashed" : "dotted" });
  const outlineSets: OverlaySet[] = [
    { id: "groups", title: "Groups", on: outlined.includes("groups"), rows: everyOutline.filter((o) => o.by === "group").map(outlineRow) },
    ...otherTrees.map((k) => ({ id: k.key, title: k.name, on: outlined.includes(k.key), rows: everyOutline.filter((o) => o.tree === k.key).map(outlineRow) })),
  ];
  // Links (owner, 27 Nov): a set in the same menu and key, a row per plain link kind; switched off one
  // by one with the outlines' list of single ones off.
  const linksOn = outlinesAll && linksShown;
  outlineSets.push(linkSet(data.items, world, linksShown, (kind) => !hiddenOutlines.includes(linkRowId(kind))));
  outlineSets.push(linkContainerSet(data.items, world, containersShown, (c) => !hiddenOutlines.includes(containerRowId(c))));
  const containersOn = outlinesAll && containersShown;
  const toggleContainer = (id: string) => {
    if (containersOn && !hiddenOutlines.includes(id)) return setHiddenOutlines([...hiddenOutlines, id]);
    const quiet = containersOn ? [] : outlineSets.find((x) => x.id === LINK_CONTAINERS_SET)!.rows.map((r) => r.id).filter((r) => r !== id);
    setHiddenOutlines([...hiddenOutlines.filter((h) => h !== id && !quiet.includes(h)), ...quiet]);
    if (!outlinesAll) setOutlinesAll(true);
    if (!containersShown) setContainersShown(true);
  };
  const toggleLinkKind = (id: string) => {
    if (linksOn && !hiddenOutlines.includes(id)) return setHiddenOutlines([...hiddenOutlines, id]);
    const quiet = linksOn ? [] : outlineSets.find((x) => x.id === LINKS_SET)!.rows.map((r) => r.id).filter((r) => r !== id);
    setHiddenOutlines([...hiddenOutlines.filter((h) => h !== id && !quiet.includes(h)), ...quiet]);
    if (!outlinesAll) setOutlinesAll(true);
    if (!linksShown) setLinksShown(true);
  };
  const pickSet = (id: string) => (id === LINKS_SET ? setLinksShown(!linksShown) : id === LINK_CONTAINERS_SET ? setContainersShown(!containersShown) : toggleOutline(id));
  const pickRow = (row: OverlayRow) => {
    if (row.opens === "link-kind") return toggleLinkKind(row.id);
    if (row.id.startsWith("link-container|")) return toggleContainer(row.id);
    const o = outlineByRow(row);
    if (o) toggleOne(o);
  };
  const outlineByRow = (row: OverlayRow) => everyOutline.find((o) => outlineId(o) === row.id);
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
    if (!size) return null;
    if (boxes.length === 0) return { k: 1, tx: 24, ty: 24 }; // an empty network: ready for the first box
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const width = Math.max(...boxes.map((b) => b.x)) + NODE_W - left;
    const height = Math.max(...boxes.map((b) => b.y)) + NODE_H - top;
    const k = clamp(Math.min((size.w - 24) / width, (size.h - 24) / height), 0.6, 1);
    const fits = width * k <= size.w - 24 && height * k <= size.h - 24;
    if (fits) return { k, tx: (size.w - width * k) / 2 - left * k, ty: 12 - top * k };
    // Too big for the screen: start at the world's box (the top of the tree), to be panned from.
    const root = boxes.find((b) => b.key === ROOT) ?? boxes[0]; // a network: its first box
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
  const boxAt = (p: Point, skip: string[]): Box | undefined => boxes.find((b) => !skip.includes(b.key) && p.x >= b.x && p.x <= b.x + NODE_W && p.y >= b.y && p.y <= b.y + NODE_H);

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
    const link = (e.target as Element).closest("[data-link]")?.getAttribute("data-link");
    if (link && !node) {
      gesture.current = { kind: "link", link, start: local(e), from: view, moved: false }; // a drag pans
      return;
    }
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
    } else if (g?.kind === "pan" || g?.kind === "fold" || g?.kind === "link") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      g.moved = true;
      setView({ k: g.from.k, tx: g.from.tx + at.x - g.start.x, ty: g.from.ty + at.y - g.start.y });
    } else if (g?.kind === "box") {
      if (!g.moved && distance(at, g.start) < tapSlop(e.pointerType)) return;
      g.moved = true;
      const dx = (at.x - g.start.x) / view.k;
      const dy = (at.y - g.start.y) / view.k;
      const dragged = selected.includes(g.key) ? selected : [g.key]; // a selected box brings the rest of the selection
      const moving = [...new Set(dragged.flatMap((k) => boxesThatMove(data.items, world, tree, k, withBranch)))];
      if (mode === "arrange") return setDrag({ key: g.key, dragged, moving, dx, dy, over: null, refused: null });
      const target = boxAt(toDiagram(at, view), moving)?.key;
      // Join: any other item's box (not the world's) takes the drop; the choices say what fits.
      const fits = mode === "join" ? !!target && target !== ROOT : !!target && dragged.every((k) => canDrop(k, target));
      setDrag({ key: g.key, dragged, moving, dx, dy, over: fits ? target! : null, refused: target && !fits ? target : null });
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
    if (g?.kind === "link" && !g.moved) return tapLink(g.link);
    if (g?.kind !== "box") return;
    if (!g.moved) return tapBox(g.key);
    const done = drag;
    setDrag(null);
    if (!done) return;
    // Dropped on the Out of scope panel: out of scope (owner, 28 Nov).
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest(".scope-panel")) return takeOutOfScope(done.dragged);
    if (done.refused) return; // dropped on a box that can't take it: back where it was
    if (done.over && mode === "join") return setJoining([done.key, done.over]); // back where they were; choose how
    if (done.over) {
      let items = data.items;
      for (const key of done.dragged) items = setParent(items, world, key, done.over === ROOT ? null : done.over, tree).items;
      await undo.apply(items);
      return setSelected([]);
    }
    await undo.apply(moveBoxes(data.items, world, tree, direction, done.moving, done.dx, done.dy));
    setSelected([]); // a move is done: start afresh (owner, 26 Nov)
  };

  // A tap on a link's line selects it (and nothing else); a second soon after opens its card.
  const tapLink = (key: string) => {
    const before = lastTap.current;
    if (before && before.key === `link:${key}` && Date.now() - before.time < DOUBLE_TAP_MS) {
      lastTap.current = null;
      swallowNextClick();
      return nav.open({ name: "link", key });
    }
    lastTap.current = { key: `link:${key}`, time: Date.now(), before: selected };
    setSelected([]);
    setPickedLinks(pickedLinks.includes(key) ? pickedLinks.filter((k) => k !== key) : [...pickedLinks, key]);
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
    setPickedLinks([]);
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
    setPickedLinks([]);
    setSelected([]);
  };

  // A new item from a double tap: inside the one selected box (in this tree), placed where tapped; made
  // in the view, it's in its scope (owner, 28 Nov): at the top of a tree, in a network's workspace.
  const madeHere = async (key: string) => {
    let items = data.items;
    const inside = selected.length === 1 ? selected[0] : null;
    const ws = network ? [...workspace, key] : workspace;
    if (network) setWorkspace(ws);
    else if (inside) items = setParent(items, world, key, inside, tree).items;
    else if (tree) items = bringIntoScope(items, tree, key);
    const box = arrangedLayout(items, world, tree, direction, new Set(), ws).find((b) => b.key === key);
    if (box && newAt) items = moveBoxes(items, world, tree, direction, [key], newAt.x - NODE_W / 2 - box.x, newAt.y - NODE_H / 2 - box.y, ws);
    await save(items);
    setNewAt(null);
    setSelected([key]);
  };

  // --- Scope: bringing items in and taking them out (owner, 28 Nov) ---------------------------------
  // Into a tree: inside a box (if dropped on one), else at the top. Into a network: connected to a box
  // (with the network type shown), else into the workspace. Placed where dropped.
  const bringIn = async (keys: string[], at: Point | null, onto: string | null) => {
    if (!tree) return;
    let items = data.items;
    let ws = workspace;
    const problems: string[] = [];
    for (const key of keys) {
      if (network) {
        if (onto && onto !== ROOT) {
          const result = join(items, world, key, tree, onto);
          if (result.problem) problems.push(`${nameOfKey(key)}: ${result.problem}`);
          else items = result.items;
        } else ws = [...new Set([...ws, key])];
      } else if (onto && onto !== ROOT) {
        const result = setParent(items, world, key, onto, tree);
        if (result.problem) problems.push(`${nameOfKey(key)}: ${result.problem}`);
        else items = result.items;
      } else items = bringIntoScope(items, tree, key);
    }
    if (network) setWorkspace(ws);
    // Where it was dropped (empty space only): each one a step down from the last.
    if (at && !onto) {
      keys.forEach((key, n) => {
        const box = arrangedLayout(items, world, tree, direction, new Set(), ws).find((b) => b.key === key);
        if (box) items = moveBoxes(items, world, tree, direction, [key], at.x - NODE_W / 2 - box.x, at.y - NODE_H / 2 - box.y + n * (NODE_H + 10), ws);
      });
    }
    await undo.apply(items);
    setScopePicked([]);
    if (problems.length) alert(`Not brought in:\n${problems.join("\n")}`);
  };
  // Out of scope: off a tree (what they held moves up); out of a network's workspace, and its connectors
  // of this type gone (asked first).
  const takeOutOfScope = async (keys: string[]) => {
    if (!tree) return;
    if (network) {
      const gone = connectorsOf(data.items, world).filter((l) => l.linkKind === tree && (keys.includes(l.from) || keys.includes(l.to)));
      if (gone.length && !confirm(`Take ${keys.length === 1 ? nameOfKey(keys[0]) : `${keys.length} items`} out of this network? ${gone.length} connector${gone.length === 1 ? "" : "s"} go too.`)) return;
      let items = data.items;
      for (const l of gone) items = removeLink(items, l.key);
      setWorkspace(workspace.filter((k) => !keys.includes(k)));
      await undo.apply(items);
    } else {
      let items = data.items;
      for (const key of keys) items = removeFromScope(items, world, key, tree);
      await undo.apply(items);
    }
    setSelected([]);
  };
  const nameOfKey = (key: string) => data.items.find((i) => i.key === key)?.name ?? key;
  // A carry from the panel: follows the pointer anywhere on the page; let go over the diagram, it lands.
  const startCarry = (keys: string[], e: ReactPointerEvent) => {
    if (keys.length === 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let current = { keys, at: start, moved: false };
    const onMove = (ev: PointerEvent) => {
      const moved = current.moved || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > tapSlop(ev.pointerType);
      current = { keys, at: { x: ev.clientX, y: ev.clientY }, moved };
      if (moved) setCarry(current);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setCarry(null);
      if (!current.moved || !view || !wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      const onto = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-node]")?.getAttribute("data-node") ?? null;
      swallowNextClick();
      bringIn(keys, toDiagram({ x: ev.clientX - r.left, y: ev.clientY - r.top }, view), onto);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const wheel = (e: WheelEvent) => {
    if (!view) return;
    const at = local(e);
    const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), 0.2, 3);
    const anchor = toDiagram(at, view);
    setView({ k, tx: at.x - anchor.x * k, ty: at.y - anchor.y * k });
  };

  // Where a box is drawn: moved along with an arrange drag, or still (inside: a ghost follows).
  const drawnAt = (b: Box): Point => (drag && drag.moving.includes(b.key) ? { x: b.x + drag.dx, y: b.y + drag.dy } : { x: b.x, y: b.y });
  const edge = (parent: Point, child: Point): string => {
    if (direction === "across") {
      const [x1, y1, x2, y2] = [parent.x + NODE_W, parent.y + NODE_H / 2, child.x, child.y + NODE_H / 2];
      return `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
    }
    const [x1, y1, x2, y2] = [parent.x + NODE_W / 2, parent.y + NODE_H, child.x + NODE_W / 2, child.y];
    return `M${x1} ${y1} C${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
  };
  // Where a link's end is drawn: its box, else the nearest box above it that's showing (its branch is
  // folded: the line is marked "via"); not in this tree at all: not drawn (owner, 27 Nov).
  // The box an item is drawn in: its own, else (folded away in a tree) the nearest box above it.
  const shownBox = (thing: string): { box: Box; via: boolean } | null => {
    const own = byKey.get(thing);
    if (own) return { box: own, via: false };
    if (network) return null; // a network folds nothing away
    const above = pathOf(data.items, world, thing, tree).slice(0, -1).reverse().find((t) => byKey.has(t.key));
    return above ? { box: byKey.get(above.key)!, via: true } : null;
  };
  // Where a line leaves a box: the middle of the side facing the other end (owner, 28 Nov: "snap to
  // whichever facing is most reasonable rather than … the bottom of a thumbnail").
  const endAt = (thing: string, other: string) => {
    const mine = shownBox(thing);
    if (!mine) return null;
    const a = drawnAt(mine.box);
    const theirs = shownBox(other);
    const b = theirs ? drawnAt(theirs.box) : a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Far apart in one column (or row): a straight line would run behind the boxes between, so it
    // leaves from the outer side and bows out round them.
    if (Math.abs(dx) < NODE_W / 2 && Math.abs(dy) > NODE_H * 1.6) return { p: { x: a.x + NODE_W, y: a.y + NODE_H / 2 }, via: mine.via, bow: { x: 1, y: 0 } };
    if (Math.abs(dy) < NODE_H / 2 && Math.abs(dx) > NODE_W * 1.6) return { p: { x: a.x + NODE_W / 2, y: a.y + NODE_H }, via: mine.via, bow: { x: 0, y: 1 } };
    const p = Math.abs(dx) / NODE_W > Math.abs(dy) / NODE_H
      ? { x: dx > 0 ? a.x + NODE_W : a.x, y: a.y + NODE_H / 2 }
      : { x: a.x + NODE_W / 2, y: dy > 0 ? a.y + NODE_H : a.y };
    return { p, via: mine.via };
  };
  // The network's own links are always drawn (they are its lines); others as Layers says.
  const lines = linkLines(data.items, world, plainLinks(data.items, world).filter((l) => (network && l.linkKind === tree) || (linksOn && !hiddenOutlines.includes(linkRowId(l.linkKind)))), endAt);
  const bulge = undefined; // lines run side to side, straight (spread apart when several share ends)
  const bands = containersOn ? containerBands(data.items, world, linkContainersIn(data.items, world).filter((c) => !hiddenOutlines.includes(containerRowId(c.key))), endAt) : [];
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
          {!network && <button className={mode === "inside" ? "on" : ""} onClick={() => setMode("inside")}>Move inside</button>}
          <button className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>Connect</button>
        </nav>
        {!network && <label className="choice"><input type="checkbox" checked={withBranch} onChange={() => setWithBranch(!withBranch)} /> Branch follows</label>}
        <TreePicker data={data} world={world} tree={tree} onChoose={setTree} withNetworks onOpen={(key) => nav.open({ name: "link-kind", key })} />
        <label className="choice"><input type="checkbox" checked={scopeShown} onChange={() => setScopeShown(!scopeShown)} /> Out of scope ({outside.length})</label>
        <span className="map-tools outlines-menu">
          <button className={outlined.length || linksOn ? "tool on" : "tool"} onClick={() => setOutlineMenu(!outlineMenu)}>Layers ▾</button>
          {outlineMenu && (
            <OverlayMenu label="outlines and links" master={outlinesAll} onMaster={() => setOutlinesAll(!outlinesAll)} sets={outlineSets} onSet={pickSet} onRow={pickRow} onClose={() => setOutlineMenu(false)} />
          )}
        </span>
        <span className="map-tools">
          <button className="tool" disabled={!undo.canUndo} onClick={undo.undo} aria-label="Undo">↶ Undo</button>
          <button className="tool" disabled={!undo.canRedo} onClick={undo.redo} aria-label="Redo">↷ Redo</button>
          {handPlaced && <button className="tool" onClick={() => confirm("Back to the automatic layout for this tree, this way round?") && undo.apply(tidyLayout(data.items, world, tree, direction))}>Tidy</button>}
          <button className="tool" onClick={() => setView(fit())}>Fit</button>
        </span>
      </div>
      {network && boxes.length === 0 && <p className="hint">Nothing in this network yet: bring items in from Out of scope (drag one onto another to connect them), or connect two with Connect.</p>}
      {/* What's selected, in a bar of its own that keeps its height (owner, 26 Nov: the Group button
          was cut off in the hint line until something else changed). */}
      <div className="selection-bar diagram-selection">
        {pickedLinks.length > 0 && selected.length === 0 ? (
          <LinkBar data={data} world={world} linkKeys={pickedLinks} onOpen={(key) => nav.open({ name: "link", key })} onContainer={() => setLinkContainer(true)} apply={(items) => undo.apply(items)} onClose={() => setPickedLinks([])} />
        ) : selected.length > 0 ? (
          <>
            <div className="title">{selected.length} selected <span className="sub">· drag one to move them all</span></div>
            <div className="selection-buttons">
              {selected.length === 2 && <button className="primary" onClick={() => setJoining([selected[0], selected[1]])}>Connect…</button>}
              {selected.length > 1 && <button className={selected.length === 2 ? "" : "primary"} onClick={() => setGrouping(true)}>Group / move into…</button>}
              {tree && selected.some((k) => k !== ROOT) && <button onClick={() => takeOutOfScope(selected.filter((k) => k !== ROOT))}>Remove {selected.length > 1 ? `${selected.length} ` : ""}from scope</button>}
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          </>
        ) : (
          <span className="sub">
            Tap: select (two to connect) · lines: select (several: a link container) · double-tap: open, or a new item ·{" "}
            {mode === "arrange" ? (network ? "drag to arrange" : withBranch ? "branches follow" : "boxes move on their own") : mode === "inside" ? "drop on a box: inside" : "drop on a box: connect"}
          </span>
        )}
      </div>
      <div className="map-layout">
      <div className="map-wrap diagram-wrap" ref={wrap} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.preventDefault()} onWheel={wheel}>
        {size && view && (
          <svg style={selectedLook(linkKindsIn(data.items, world).find((k) => k.key === tree))} width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
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
              <ContainerBands bands={bands} k={1} bulge={bulge} />
              <LinkLines lines={lines} k={1} picked={pickedLinks} gap={14} bulge={bulge} />
              {boxes.map((b) => {
                const p = drawnAt(b);
                const classes = ["diagram-node", b.key === ROOT ? "root" : "", flagged.has(b.key) ? "misfit" : "", selected.includes(b.key) ? "selected" : "", drag?.moving.includes(b.key) ? "moving" : "", drag?.over === b.key ? "target" : "", drag?.refused === b.key ? "refused" : ""];
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
            </g>
          </svg>
        )}
      </div>
      <div className="side-column">
        {scopeShown && tree && (
          <ScopePanel data={data} world={world} things={outside} network={network} selected={scopePicked} onSelect={setScopePicked} onOpen={(key) => nav.open({ name: "place", key })} onBringIn={(keys) => bringIn(keys, null, null)} onCarry={startCarry} />
        )}
        <OverlayList heading="Key" sets={outlineSets} picked={outlineHover} onRow={pickRow} onHover={setOutlineHover} onOpen={(row) => nav.open({ name: row.opens, key: row.key })} />
      </div>
      {carry?.moved && <div className="carry-ghost" style={{ left: carry.at.x + 12, top: carry.at.y + 12 }}>{carry.keys.length === 1 ? nameOfKey(carry.keys[0]) : `${carry.keys.length} items`}</div>}
      </div>
      {joining && (
        <JoinPopup
          data={data}
          world={world}
          ends={joining}
          apply={async (items) => {
            await undo.apply(items);
            setSelected([]);
          }}
          onClose={() => setJoining(null)}
        />
      )}
      {linkContainer && pickedLinks.length > 0 && (
        <LinkContainerPopup data={data} world={world} linkKeys={pickedLinks} apply={async (items) => (await undo.apply(items), setPickedLinks([]))} onClose={() => setLinkContainer(false)} />
      )}
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
