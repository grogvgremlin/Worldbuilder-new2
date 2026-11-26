// World → the open world: its items (as a tree, or in groups), a tree diagram, its maps, its kinds.
// Design: design/world-structure.md §1 (one kind of node: a thing, here a "world item": owner,
// 25 Nov), §2 (kinds as world content), §3 (several trees: "different views are different link
// kinds"), §4 (containment; groups as area things), §5 (maps); spec/session-20-notes-3.md §0.1
// (structure first on the phone, a canvas as another view).
import { useState, type ReactNode } from "react";
import type { Item, Thing } from "../../../items/items";
import { linkKindsIn, linksIn, mapsIn, newKey, removeThing, removeThingKind, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { SwipeRow } from "../../swipe";
import { childrenOf, firstTree, hideHere, isContainer, looseIn, looseItems, pathOf, setParent, topPlaces, treeKinds, treeWarnings } from "../../../world/places";
import { iconOf, newMap } from "../../../world/maps";
import { addToGroup, groupLinkKinds, groupsIn, isOnlyAGroup, membersOf, newGroupLinkKind } from "../../../world/groups";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { recall, recalled, rememberAll, useRemembered } from "./remembered";
import { useFoldAll } from "./fold-all";
import { groupKindFor } from "../../../world/bulk";
import { TreeDiagram } from "./TreeDiagram";
import { ALL, TreePicker, useChosenTree } from "./tree-picker";
import { hasKind, inOrder, itemsWithMisfits, kindTree, misfitLinks, moveInOrder, refusal, removeLinkKind, setFlavourOf, type Misfit } from "../../../world/kinds";

type Tab = "items" | "diagram" | "maps" | "kinds";

export function WorldScreen({ data, nav, worldKey }: { data: AppData; nav: Nav; worldKey: string }) {
  // Which section is open: chosen in the World bar (src/app/screens/world/Trail.tsx), read here.
  const tab = recall<Tab>(`${worldKey}|tab`, "items");
  const [, setChanged] = useState(0);
  const world = worldOf(data.items, worldKey);
  if (!world) return <p className="hint">This world isn't on the device any more.</p>;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));

  return (
    <section>
      <h1>{world.name}</h1>
      {world.description && <p className="sub">{world.description}</p>}
      {tab === "items" && <Items data={data} nav={nav} world={worldKey} save={save} />}
      {tab === "diagram" && <TreeDiagram data={data} nav={nav} world={worldKey} save={save} />}
      {tab === "maps" && <Maps data={data} nav={nav} world={worldKey} save={save} />}
      {tab === "kinds" && <Kinds data={data} nav={nav} world={worldKey} save={save} />}
    </section>
  );
}

export type Part = { data: AppData; nav: Nav; world: string; save: (items: Item[]) => Promise<void> };

// --- Items: the tree or the groups, a filter, and a new item --------------------------------------

type Shape = "all" | "containers" | "base";

function Items({ data, nav, world, save }: Part) {
  const [view, setView] = useRemembered<"tree" | "groups" | "loose" | "misfits">(`${world}|items-view`, "tree");
  const [epoch, setEpoch] = useState(0); // bumped by Fold all / Open all: the tree redraws
  const [tree, setTree] = useChosenTree(data, world);
  const [byKind, setByKind] = useRemembered(`${world}|by-kind`, false); // the tree picker's "All"
  const [shape, setShape] = useRemembered<Shape>(`${world}|shape`, "all");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const kinds = kindTree(data.items, world);
  const warnings = treeWarnings(data.items, world, tree);
  const misfits = misfitLinks(data.items, world);
  const searching = text.trim() !== "" || kind !== null;
  const matches = thingsIn(data.items, world)
    .filter((t) => (kind ? hasKind(data.items, world, t.kinds, kind) : true)) // a kind's flavours count
    .filter((t) => shape === "all" || (shape === "containers") === isContainer(data.items, world, t.key))
    .filter((t) => matchesText(t, text))
    .sort((a, b) => a.name.localeCompare(b.name));
  const worldName = worldOf(data.items, world)?.name ?? "";
  const row = (t: Thing) => (
    <li key={t.key}>
      <SwipeRow action="Remove" onAction={() => removeItem(data, save, t)}>
        <PlaceRow data={data} thing={t} withPath onOpen={() => nav.open({ name: "place", key: t.key })} />
      </SwipeRow>
    </li>
  );

  return (
    <>
      <Fold title={view === "groups" && !searching ? "+ New group" : "+ New item"}>
        {view === "groups" && !searching ? (
          <NewGroup data={data} world={world} save={save} onMade={(key) => nav.open({ name: "place", key })} />
        ) : (
          <NewPlace data={data} world={world} save={save} onMade={(key) => nav.open({ name: "place", key })} />
        )}
      </Fold>
      <input className="filter" placeholder="Find an item (name, other names, summary, tags)" value={text} onChange={(e) => setText(e.target.value)} />
      {/* Two rows (owner, 26 Nov): which items (one always chosen), then kinds to narrow by. */}
      <nav className="segments small shape-row">
        {(["all", "containers", "base"] as Shape[]).map((sh) => (
          <button key={sh} className={shape === sh ? "on" : ""} onClick={() => setShape(sh)}>{sh === "all" ? "All" : sh === "containers" ? "Containers" : "Base items"}</button>
        ))}
      </nav>
      {kinds.length > 1 && (
        <div className="chips kind-row">
          <span className="sub">Kind:</span>
          {kinds.map(({ kind: k, depth }) => (
            <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(kind === k.key ? null : k.key)}>
              {depth > 0 ? "↳ " : ""}{k.icon} {k.name}
            </button>
          ))}
        </div>
      )}
      {warnings.length > 0 && <ul className="plain problems">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {misfits.length > 0 && view !== "misfits" && (
        <p className="problems-line">⚠ {misfits.length} link{misfits.length === 1 ? " doesn't" : "s don't"} fit what its link kind takes · <button className="link" onClick={() => (setShape("all"), setText(""), setKind(null), setView("misfits"))}>Show</button></p>
      )}
      {thingsIn(data.items, world).length === 0 && <p className="hint">No items yet. Add one with + New item above, or double-tap a map or the diagram.</p>}
      {searching ? (
        <ul className="list">{matches.map(row)}</ul>
      ) : shape === "containers" ? (
        <Containers data={data} world={world} row={row} />
      ) : shape === "base" ? (
        <>
          <p className="sub">Base items hold nothing.</p>
          <ul className="list">{matches.map(row)}</ul>
        </>
      ) : (
        <>
          <div className="view-row">
            <nav className="segments small">
              <button className={view === "tree" ? "on" : ""} onClick={() => setView("tree")}>Tree</button>
              <button className={view === "groups" ? "on" : ""} onClick={() => setView("groups")}>Groups</button>
              <button className={view === "loose" ? "on" : ""} onClick={() => setView("loose")}>Loose ({looseItems(data.items, world).length})</button>
              {misfits.length > 0 && <button className={view === "misfits" ? "on" : ""} onClick={() => setView("misfits")}>⚠ Doesn't fit ({misfits.length})</button>}
            </nav>
            {view === "tree" && <TreePicker data={data} world={world} tree={byKind ? ALL : tree} onChoose={(k) => (k === ALL ? setByKind(true) : (setByKind(false), setTree(k)))} withAll />}
          </div>
          {view === "tree" && byKind && <ByKind data={data} world={world} row={row} />}
          {view === "tree" && !byKind && tree && <HiddenNote data={data} nav={nav} world={world} tree={tree} />}
          {view === "tree" && !byKind && (
            <p className="sub">
              <span className="fold-all">
                <button className="link" onClick={() => (rememberAll(`${world}|open|${tree}|`, false), setEpoch((n) => n + 1))}>Fold all</button> ·{" "}
                <button className="link" onClick={() => (rememberAll(`${world}|open|${tree}|`, true), setEpoch((n) => n + 1))}>Open all</button>
              </span>
            </p>
          )}
          {view === "tree" && !byKind && (
            <ul className="list tree" key={epoch}>
              <li className="tree-root">{worldName}</li>
              {topPlaces(data.items, world, tree)
                .filter((t) => !isOnlyAGroup(data.items, world, t.key))
                .map((t) => <Branch key={t.key} data={data} nav={nav} world={world} tree={tree} thing={t} depth={1} save={save} />)}
            </ul>
          )}
          {view === "groups" && <Groups data={data} nav={nav} world={world} save={save} />}
          {view === "misfits" && <MisfitList data={data} nav={nav} misfits={misfits} save={save} />}
          {view === "loose" && (
            <>
              <p className="sub">In no tree and no group: neither inside anything nor holding anything.</p>
              <ul className="list">{looseItems(data.items, world).map(row)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

// Links that don't fit what their link kind takes (owner, 26 Nov: kept, but always flagged, strict or
// warn): each with why, its two ends to open, and swipe to remove the link.
export function MisfitList({ data, nav, misfits, save }: { data: AppData; nav: Nav; misfits: Misfit[]; save: (items: Item[]) => Promise<void> }) {
  const nameOf = (key: string) => data.items.find((i) => i.key === key)?.name ?? key;
  if (misfits.length === 0) return <p className="sub">Every link fits what its link kind takes.</p>;
  return (
    <>
      <p className="sub">Made before a rule changed, or under a link kind that only warns. Change the rule (the link kind's page), move the items, or swipe a link away.</p>
      <ul className="list">
        {misfits.map((m) => (
          <li key={m.link.key}>
            <SwipeRow action="Remove link" onAction={() => save(data.items.filter((i) => i.key !== m.link.key))}>
              <div className="misfit-row">
                <span>
                  <button className="link" onClick={() => nav.open({ name: "place", key: m.link.from })}>{nameOf(m.link.from)}</button>{" "}
                  <button className="link sub" onClick={() => nav.open({ name: "link-kind", key: m.link.linkKind })}>{nameOf(m.link.linkKind)}</button>{" "}
                  <button className="link" onClick={() => nav.open({ name: "place", key: m.link.to })}>{nameOf(m.link.to)}</button>
                </span>
                <span className="sub warn">{m.why}</span>
              </div>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </>
  );
}

// How many loose items a tree hides, with the way to show them again (the link kind's page).
export function HiddenNote({ data, nav, world, tree }: { data: AppData; nav: Nav; world: string; tree: string }) {
  const kind = linkKindsIn(data.items, world).find((k) => k.key === tree);
  const loose = looseIn(data.items, world, tree);
  const hidden = kind?.loose === "hide" ? loose.length : loose.filter((t) => (kind?.hiddenHere ?? []).includes(t.key)).length;
  if (!kind || hidden === 0) return <p className="sub swipe-hint">Swipe a loose item left to hide it from this tree.</p>;
  return (
    <p className="sub">
      {hidden} loose item{hidden === 1 ? "" : "s"} hidden from "{kind.name}" ·{" "}
      <button className="link" onClick={() => nav.open({ name: "link-kind", key: tree })}>Show or hide loose items</button>
    </p>
  );
}

// Containers split (owner, 26 Nov): those holding something in each tree, by tree, then groups.
function Containers({ data, world, row }: { data: AppData; world: string; row: (t: Thing) => ReactNode }) {
  const folds = useFoldAll();
  const sections = [
    ...treeKinds(data.items, world).map((k) => ({ id: k.key, title: `In the tree "${k.name}"`, list: thingsIn(data.items, world).filter((t) => childrenOf(data.items, world, t.key, k.key).length > 0) })),
    { id: "groups", title: "Groups", list: groupsIn(data.items, world) },
  ];
  return (
    <>
      <p className="sub">Containers hold something: in a tree (one at a time), or as a group (many at once). {folds.controls}</p>
      {sections.map((sec) => (
        <details key={`${sec.id}|${folds.epoch}`} className="fold" open={folds.openFor(true)}>
          <summary>{sec.title} ({sec.list.length})</summary>
          <ul className="list">{[...sec.list].sort((a, b) => a.name.localeCompare(b.name)).map(row)}</ul>
        </details>
      ))}
    </>
  );
}

// Every item, by kind and flavour (the tree picker's "All", owner, 26 Nov).
function ByKind({ data, world, row }: { data: AppData; world: string; row: (t: Thing) => ReactNode }) {
  const folds = useFoldAll();
  const things = thingsIn(data.items, world);
  const sections = [
    ...kindTree(data.items, world).map(({ kind, depth }) => ({ id: kind.key, title: `${"↳ ".repeat(depth ? 1 : 0)}${kind.icon ?? ""} ${kind.name}`, depth, list: things.filter((t) => t.kinds.includes(kind.key)) })),
    { id: "none", title: "No kind", depth: 0, list: things.filter((t) => t.kinds.length === 0) },
  ].filter((sec) => sec.list.length > 0);
  return (
    <>
      <p className="sub">{folds.controls}</p>
      {sections.map((sec) => (
        <details key={`${sec.id}|${folds.epoch}`} className="fold" open={folds.openFor(true)} style={{ marginLeft: sec.depth * 14 }}>
          <summary>{sec.title} ({sec.list.length})</summary>
          <ul className="list">{[...sec.list].sort((a, b) => a.name.localeCompare(b.name)).map(row)}</ul>
        </details>
      ))}
    </>
  );
}

// A form folded away at the top of a list until wanted (owner, 26 Nov: "the new item set-up
// collapsing at the top"). Remembers being open while the app is open.
function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useRemembered(`fold|${title}`, false);
  return (
    <details className="fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

// --- Groups: items in several groups at once (area things, world-structure §4) --------------------

function Groups({ data, nav, world, save }: Part) {
  const [epoch, setEpoch] = useState(0); // bumped by Fold all / Open all
  const kinds = groupLinkKinds(data.items, world);
  if (kinds.length === 0) {
    const add = () => save([...data.items, newGroupLinkKind(data.items, world, `${world}.link-kind.in-area`)]);
    return (
      <div className="hint">
        <p>This world has no link kind for groups yet: an item can sit in many groups at once (a valley, a plague zone, a town split by a border), beside the one container it's in.</p>
        <button className="primary" onClick={add}>Add "in area"</button>
      </div>
    );
  }
  const groups = groupsIn(data.items, world);
  return (
    <>
      {groups.length === 0 && <p className="hint">No groups yet. A group is an item others are "{kinds[0].name}": make one with + New group above.</p>}
      {groups.length > 0 && (
        <p className="sub">
          <span className="fold-all">
            <button className="link" onClick={() => (rememberAll(`${world}|gopen|`, false), setEpoch((n) => n + 1))}>Fold all</button> ·{" "}
            <button className="link" onClick={() => (rememberAll(`${world}|gopen|`, true), setEpoch((n) => n + 1))}>Open all</button>
          </span>
        </p>
      )}
      <ul className="list tree" key={epoch}>
        {groups.map((g) => <GroupBranch key={g.key} data={data} nav={nav} world={world} group={g} />)}
      </ul>
    </>
  );
}

function GroupBranch({ data, nav, world, group }: { data: AppData; nav: Nav; world: string; group: Thing }) {
  const [open, setOpen] = useRemembered(`${world}|gopen|${group.key}`, recalled(`${world}|gopen|${group.key}`, `${world}|gopen|`, false));
  const members = membersOf(data.items, world, group.key);
  return (
    <>
      <li className="branch">
        <button className="twisty" aria-label={open ? "Fold" : "Unfold"} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>
        <button onClick={() => nav.open({ name: "place", key: group.key })}>
          <span className="title">{iconOf(data.items, group)} {group.name}</span>
          <span className="sub">{[`${members.length} in it`, group.summary].filter(Boolean).join(" · ")}</span>
        </button>
      </li>
      {open &&
        members.map((m) => (
          <li key={m.link.key} className="branch" style={{ paddingLeft: 18 }}>
            <span className="twisty" />
            <PlaceRow data={data} thing={m.thing} withPath onOpen={() => nav.open({ name: "place", key: m.thing.key })} />
          </li>
        ))}
    </>
  );
}

// A new group: its name, then the items in it, ticked from a list.
function NewGroup({ data, world, save, onMade }: { data: AppData; world: string; save: (items: Item[]) => Promise<void>; onMade: (key: string) => void }) {
  const [name, setName] = useState("");
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const linkKind = groupLinkKinds(data.items, world)[0];
  const kinds = thingKindsIn(data.items, world);
  const places = thingsIn(data.items, world).filter((t) => matchesText(t, find)).sort((a, b) => a.name.localeCompare(b.name));
  const make = async () => {
    if (!name.trim()) return;
    const key = newKey(data.items, world, "thing", name);
    const kind = groupKindFor(data.items, world, linkKind.key); // one the group's link kind takes (owner, 26 Nov)
    let items: Item[] = [...data.items, { key, kind: "thing", world, name: name.trim(), kinds: kind ? [kind] : kinds.length === 1 ? [kinds[0].key] : [], fields: [] }];
    for (const member of picked) items = addToGroup(items, world, member, linkKind.key, key).items;
    await save(items);
    setName("");
    setPicked([]);
    onMade(key);
  };
  const toggle = (key: string) => setPicked(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);
  return (
    <div className="form">
      <h2>New group</h2>
      <input className="filter" placeholder="Name (e.g. Aver valley)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="filter" placeholder="Find items to put in it" value={find} onChange={(e) => setFind(e.target.value)} />
      <div className="pick-list">
        {places.map((t) => (
          <label key={t.key} className="choice">
            <input type="checkbox" checked={picked.includes(t.key)} onChange={() => toggle(t.key)} /> {t.name}
            <span className="sub"> {pathOf(data.items, world, t.key).slice(0, -1).map((p) => p.name).join(" › ")}</span>
          </label>
        ))}
      </div>
      <div className="buttons">
        <button className="primary" disabled={!name.trim()} onClick={make}>Add group{picked.length ? ` of ${picked.length}` : ""}</button>
      </div>
    </div>
  );
}

function matchesText(thing: Thing, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  const words = [thing.name, thing.summary ?? "", ...(thing.otherNames ?? []).map((n) => n.name), ...(thing.tags ?? [])];
  return words.some((w) => w.toLowerCase().includes(q));
}

// An item and, unfolded, what it holds in this tree. The first level starts open.
function Branch({ data, nav, world, tree, thing, depth, save }: { data: AppData; nav: Nav; world: string; tree: string | undefined; thing: Thing; depth: number; save: (items: Item[]) => Promise<void> }) {
  const children = childrenOf(data.items, world, thing.key, tree);
  const [open, setOpen] = useRemembered(`${world}|open|${tree}|${thing.key}`, recalled(`${world}|open|${tree}|${thing.key}`, `${world}|open|${tree}|`, depth < 2));
  return (
    <>
      <li className="branch" style={{ paddingLeft: depth * 16 }}>
        {children.length > 0 ? (
          <button className="twisty" aria-label={open ? "Fold" : "Unfold"} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>
        ) : (
          <span className="twisty" />
        )}
        {/* Loose at the top of a tree (nothing above, nothing inside): swipe hides it from this tree. */}
        {depth === 1 && children.length === 0 && tree ? (
          <SwipeRow action="Hide here" onAction={() => save(hideHere(data.items, tree, thing.key, true))}>
            <PlaceRow data={data} thing={thing} count={0} tree={tree} onOpen={() => nav.open({ name: "place", key: thing.key })} />
          </SwipeRow>
        ) : (
          <SwipeRow action="Remove" onAction={() => removeItem(data, save, thing)}>
            <PlaceRow data={data} thing={thing} count={children.length} tree={tree} onOpen={() => nav.open({ name: "place", key: thing.key })} />
          </SwipeRow>
        )}
      </li>
      {open && children.map((c) => <Branch key={c.key} data={data} nav={nav} world={world} tree={tree} thing={c} depth={depth + 1} save={save} />)}
    </>
  );
}

function PlaceRow({ data, thing, withPath, count, onOpen, tree }: { data: AppData; thing: Thing; withPath?: boolean; count?: number; onOpen: () => void; tree?: string }) {
  const all = thingKindsIn(data.items, thing.world);
  const kinds = all.length > 1 ? all.filter((k) => thing.kinds.includes(k.key)).map((k) => k.name) : []; // one kind says nothing
  const path = withPath ? pathOf(data.items, thing.world, thing.key).slice(0, -1).map((t) => t.name).join(" › ") : "";
  const sub = [kinds.join(", "), path, count ? `${count} inside` : "", thing.summary ?? ""].filter(Boolean).join(" · ");
  const flagged = itemsWithMisfits(data.items, thing.world, tree).has(thing.key); // in a link that doesn't fit (this tree's, in a tree)
  return (
    <button onClick={onOpen}>
      <span className="title">{flagged && <span className="warn" title="In a link that doesn't fit">⚠ </span>}{iconOf(data.items, thing)} {thing.name}</span>
      {sub && <span className="sub">{sub}</span>}
    </button>
  );
}

// Name, kind and where it is (in the main tree); everything else on its page.
export function NewPlace({ data, world, save, onMade, inside, autoFocus, noPlacePicker }: { data: AppData; world: string; save: (items: Item[]) => Promise<void>; onMade: (key: string) => void; inside?: string; autoFocus?: boolean; noPlacePicker?: boolean }) {
  const kinds = thingKindsIn(data.items, world);
  const [name, setName] = useState("");
  // With one kind (the starter's generic Place), every new item has it; with several, the kind most
  // of its new siblings have.
  const [kind, setKind] = useState(kinds.length === 1 ? kinds[0].key : inside ? usualKindInside(data.items, world, inside) : "");
  const [parent, setParentKey] = useState(inside ?? "");
  const tree = firstTree(data.items, world) ?? "";
  const places = thingsIn(data.items, world).filter((t) => !refusal(data.items, world, tree, "to", t.key)).sort((a, b) => a.name.localeCompare(b.name));
  const make = async () => {
    if (!name.trim()) return;
    const key = newKey(data.items, world, "thing", name);
    const thing: Thing = { key, kind: "thing", world, name: name.trim(), kinds: kind ? [kind] : [], fields: [] };
    let items: Item[] = [...data.items, thing];
    if (parent) items = setParent(items, world, key, parent).items;
    await save(items);
    setName("");
    onMade(key);
  };
  return (
    <div className="form">
      <h2>{inside ? "Add an item inside" : "New item"}</h2>
      <input className="filter" placeholder="Name" autoFocus={autoFocus} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && make()} />
      <div className="row-fields">
        {kinds.length > 1 && (
        <label className="stack">
          <span className="sub">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">(none)</option>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.name}</option>)}
          </select>
        </label>
        )}
        {!inside && !noPlacePicker && (
          <label className="stack">
            <span className="sub">In</span>
            <select value={parent} onChange={(e) => setParentKey(e.target.value)}>
              <option value="">(straight in the world)</option>
              {places.map((p) => <option key={p.key} value={p.key}>{pathOf(data.items, world, p.key).map((t) => t.name).join(" › ")}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="buttons">
        <button className="primary" disabled={!name.trim()} onClick={make}>Add</button>
      </div>
    </div>
  );
}

// The kind most of an item's contents have, so a new one starts the same (blank if none).
function usualKindInside(items: Item[], world: string, parent: string): string {
  const count = new Map<string, number>();
  for (const c of childrenOf(items, world, parent)) for (const k of c.kinds) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// Removes an item after asking (swipe or cross on any list of items). What it held moves up to sit
// straight in the world; its links and pins go.
async function removeItem(data: AppData, save: (items: Item[]) => Promise<void>, thing: Thing) {
  const held = childrenOf(data.items, thing.world, thing.key).length;
  if (!confirm(`Remove ${thing.name}?${held ? ` The ${held} item${held === 1 ? "" : "s"} inside it move up to sit straight in the world.` : ""}`)) return;
  await save(removeThing(data.items, thing.key));
}

// Up and down arrows for a list in the owner's order.
function OrderArrows({ onMove }: { onMove: (by: number) => void }) {
  return (
    <span className="order-arrows">
      <button className="link" aria-label="Up" onClick={() => onMove(-1)}>↑</button>
      <button className="link" aria-label="Down" onClick={() => onMove(1)}>↓</button>
    </span>
  );
}

// --- Maps ----------------------------------------------------------------------------------------

function Maps({ data, nav, world, save }: Part) {
  const [name, setName] = useState("");
  const maps = mapsIn(data.items, world);
  const make = async () => {
    const map = newMap(data.items, world, name || `Map ${maps.length + 1}`);
    await save([...data.items, map]);
    setName("");
    nav.open({ name: "map", key: map.key });
  };
  return (
    <>
      {maps.length === 0 && <p className="hint">No maps yet. A map here is a blank sheet you pin items on; a picture behind it comes with images.</p>}
      <ul className="list">
        {maps.map((m) => (
          <li key={m.key}>
            <SwipeRow action="Remove" onAction={async () => confirm(`Remove the map ${m.name}? Its items stay in the world.`) && (await save(data.items.filter((i) => i.key !== m.key)))}>
              <button onClick={() => nav.open({ name: "map", key: m.key })}>
                <span className="title">🗺️ {m.name}</span>
                <span className="sub">{m.pins.length} pinned</span>
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
      <div className="form">
        <h2>New map</h2>
        <input className="filter" placeholder="Name (e.g. Campaign map)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="buttons"><button className="primary" onClick={make}>Add</button></div>
      </div>
    </>
  );
}

// --- Kinds: kinds of item, kinds of link, and the main tree --------------------------------------

function Kinds({ data, nav, world, save }: Part) {
  const [name, setName] = useState("");
  const [parentKind, setParentKind] = useState("");
  const [linkName, setLinkName] = useState("");
  const w = worldOf(data.items, world)!;
  const thingKinds = kindTree(data.items, world);
  const linkKinds = inOrder(data.items, world, linkKindsIn(data.items, world)); // the owner's display order
  const removeKind = async (key: string, name: string) => {
    const count = thingsIn(data.items, world).filter((t) => t.kinds.includes(key)).length;
    if (!confirm(`Remove the kind ${name}?${count ? ` ${count} item${count === 1 ? "" : "s"} lose it; their fields stay as their own.` : ""}`)) return;
    await save(removeThingKind(data.items, key));
  };
  const removeLink = async (key: string, name: string) => {
    const count = linksIn(data.items, world).filter((l) => l.linkKind === key).length;
    if (!confirm(`Remove the link kind ${name}?${count ? ` Its ${count} link${count === 1 ? "" : "s"} go too.` : ""}`)) return;
    await save(removeLinkKind(data.items, world, key));
  };
  const addKind = async () => {
    if (!name.trim()) return;
    const key = newKey(data.items, world, "thing-kind", name);
    await save(setFlavourOf([...data.items, { key, kind: "thing-kind", world, name: name.trim(), fields: [] }], world, key, parentKind || null).items);
    setName("");
    nav.open({ name: "thing-kind", key });
  };
  const addLinkKind = async () => {
    if (!linkName.trim()) return;
    const key = newKey(data.items, world, "link-kind", linkName);
    await save([...data.items, { key, kind: "link-kind", world, name: linkName.trim(), direction: "one-way", hierarchy: "none" }]);
    setLinkName("");
    nav.open({ name: "link-kind", key });
  };

  return (
    <>
      <p className="sub">A world's kinds are its own: change them freely. Swipe one left to remove it; ↑ ↓ set the order they're shown in.</p>
      <h2>Kinds of item</h2>
      <ul className="list">
        {thingKinds.map(({ kind: k, depth }) => {
          const siblings = thingKindsIn(data.items, world).filter((o) => o.flavourOf === k.flavourOf);
          return (
            <li key={k.key} className="ordered-row" style={{ paddingLeft: depth * 18 }}>
              <SwipeRow action="Remove" onAction={() => removeKind(k.key, k.name)}>
                <button onClick={() => nav.open({ name: "thing-kind", key: k.key })}>
                  <span className="title">{depth > 0 ? "↳ " : ""}{k.icon} {k.name}</span>
                  <span className="sub">{[k.about, k.fields.map((f) => f.name).join(", ")].filter(Boolean).join(" · ") || (depth > 0 ? "its parent's fields" : "no fields yet")}</span>
                </button>
              </SwipeRow>
              <OrderArrows onMove={(by) => save(moveInOrder(data.items, world, siblings, k.key, by))} />
            </li>
          );
        })}
      </ul>
      <div className="inline-add">
        <input className="filter" placeholder="New kind (e.g. City)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKind()} />
        <button className="primary" onClick={addKind}>Add</button>
      </div>
      <label className="stack">
        <select value={parentKind} onChange={(e) => setParentKind(e.target.value)}>
          <option value="">a kind of its own</option>
          {thingKinds.map(({ kind: k, depth }) => <option key={k.key} value={k.key}>{"  ".repeat(depth)}a flavour of {k.name}</option>)}
        </select>
        <span className="sub">A flavour has its parent's fields as well as its own, and anything that expects the parent accepts it.</span>
      </label>
      <h2>Kinds of link</h2>
      <ul className="list">
        {linkKinds.map((k) => (
          <li key={k.key} className="ordered-row">
            <SwipeRow action="Remove" onAction={() => removeLink(k.key, k.name)}>
              <button onClick={() => nav.open({ name: "link-kind", key: k.key })}>
                <span className="title">{k.name}{k.reverseName ? ` / ${k.reverseName}` : ""}</span>
                <span className="sub">{[k.direction, k.hierarchy === "none" ? "" : k.hierarchy, k.strictness === "warn" ? "warn only" : "", k.about].filter(Boolean).join(" · ")}</span>
              </button>
            </SwipeRow>
            <OrderArrows onMove={(by) => save(moveInOrder(data.items, world, linkKindsIn(data.items, world), k.key, by))} />
          </li>
        ))}
      </ul>
      <div className="inline-add">
        <input className="filter" placeholder="New link kind (e.g. road to)" value={linkName} onChange={(e) => setLinkName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLinkKind()} />
        <button className="primary" onClick={addLinkKind}>Add</button>
      </div>
      <p className="sub">Trees (one-parent link kinds) are shown in this order: the first is shown first, and used wherever no tree is chosen.</p>
    </>
  );
}
