// World → the open world: its places (as a tree by containment), its maps, and its kinds.
// Design: design/world-structure.md §2 (kinds as world content), §4 (containment is a tree),
// §5 (maps; abstract views zoom by containment); spec/session-20-notes-3.md §0.1 (structure first:
// a tree and forms on the phone, the canvas as another view).
import { useState } from "react";
import type { Item, Thing } from "../../../items/items";
import { linkKindsIn, mapsIn, newKey, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { childrenOf, pathOf, setParent, topPlaces, treeWarnings } from "../../../world/places";
import { iconOf, newMap } from "../../../world/maps";
import { addToGroup, groupLinkKinds, groupsIn, isOnlyAGroup, membersOf, newGroupLinkKind } from "../../../world/groups";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

type Tab = "places" | "maps" | "kinds";

export function WorldScreen({ data, nav, worldKey }: { data: AppData; nav: Nav; worldKey: string }) {
  const [tab, setTab] = useState<Tab>("places");
  const [, setChanged] = useState(0);
  const world = worldOf(data.items, worldKey);
  if (!world) return <p className="hint">This world isn't on the device any more.</p>;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));

  return (
    <section>
      <h1>{world.name}</h1>
      {world.description && <p className="sub">{world.description}</p>}
      <nav className="segments">
        {(["places", "maps", "kinds"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "places" && <Places data={data} nav={nav} world={worldKey} save={save} />}
      {tab === "maps" && <Maps data={data} nav={nav} world={worldKey} save={save} />}
      {tab === "kinds" && <Kinds data={data} nav={nav} world={worldKey} save={save} />}
    </section>
  );
}

type Part = { data: AppData; nav: Nav; world: string; save: (items: Item[]) => Promise<void> };

// --- Places: the tree, a filter, and a new place --------------------------------------------------

function Places({ data, nav, world, save }: Part) {
  const [view, setView] = useState<"tree" | "groups">("tree");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const kinds = thingKindsIn(data.items, world);
  const warnings = treeWarnings(data.items, world);
  const filtering = text.trim() !== "" || kind !== null;
  const matches = thingsIn(data.items, world)
    .filter((t) => (kind ? t.kinds.includes(kind) : true))
    .filter((t) => matchesText(t, text))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <input className="filter" placeholder="Find a place (name, other names, summary)" value={text} onChange={(e) => setText(e.target.value)} />
      {kinds.length > 1 && (
        <div className="chips">
          {kinds.map((k) => (
            <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(kind === k.key ? null : k.key)}>
              {k.icon} {k.name}
            </button>
          ))}
        </div>
      )}
      {warnings.length > 0 && <ul className="plain problems">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {thingsIn(data.items, world).length === 0 && <p className="hint">No places yet. Add one below, or pin one straight onto a map.</p>}
      {filtering ? (
        <ul className="list">
          {matches.map((t) => (
            <li key={t.key}>
              <PlaceRow data={data} thing={t} withPath onOpen={() => nav.open({ name: "place", key: t.key })} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <nav className="segments small">
            <button className={view === "tree" ? "on" : ""} onClick={() => setView("tree")}>Tree</button>
            <button className={view === "groups" ? "on" : ""} onClick={() => setView("groups")}>Groups</button>
          </nav>
          {view === "tree" ? (
            <ul className="list tree">
              {topPlaces(data.items, world)
                .filter((t) => !isOnlyAGroup(data.items, world, t.key))
                .map((t) => <Branch key={t.key} data={data} nav={nav} world={world} thing={t} depth={0} />)}
            </ul>
          ) : (
            <Groups data={data} nav={nav} world={world} save={save} />
          )}
        </>
      )}
      {(filtering || view === "tree") && <NewPlace data={data} world={world} save={save} onMade={(key) => nav.open({ name: "place", key })} />}
    </>
  );
}

// --- Groups: places in several groups at once (area things, world-structure §4) -------------------

function Groups({ data, nav, world, save }: Part) {
  const kinds = groupLinkKinds(data.items, world);
  if (kinds.length === 0) {
    const add = () => save([...data.items, newGroupLinkKind(data.items, world, `${world}.link-kind.in-area`)]);
    return (
      <div className="hint">
        <p>This world has no link kind for groups yet: a place can sit in many groups at once (a valley, a plague zone, a town split by a border), beside the one place it's in.</p>
        <button className="primary" onClick={add}>Add "in area"</button>
      </div>
    );
  }
  const groups = groupsIn(data.items, world);
  return (
    <>
      {groups.length === 0 && <p className="hint">No groups yet. A group is a place others are "{kinds[0].name}": make one below.</p>}
      <ul className="list tree">
        {groups.map((g) => <GroupBranch key={g.key} data={data} nav={nav} world={world} group={g} />)}
      </ul>
      <NewGroup data={data} world={world} save={save} onMade={(key) => nav.open({ name: "place", key })} />
    </>
  );
}

function GroupBranch({ data, nav, world, group }: { data: AppData; nav: Nav; world: string; group: Thing }) {
  const [open, setOpen] = useState(false);
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

// A new group: its name, then the places in it, ticked from a list.
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
    let items: Item[] = [...data.items, { key, kind: "thing", world, name: name.trim(), kinds: kinds.length === 1 ? [kinds[0].key] : [], fields: [] }];
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
      <input className="filter" placeholder="Find places to put in it" value={find} onChange={(e) => setFind(e.target.value)} />
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

// A place and, unfolded, what it holds. The first two levels start open.
function Branch({ data, nav, world, thing, depth }: { data: AppData; nav: Nav; world: string; thing: Thing; depth: number }) {
  const children = childrenOf(data.items, world, thing.key);
  const [open, setOpen] = useState(depth < 1);
  return (
    <>
      <li className="branch" style={{ paddingLeft: depth * 18 }}>
        {children.length > 0 ? (
          <button className="twisty" aria-label={open ? "Fold" : "Unfold"} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>
        ) : (
          <span className="twisty" />
        )}
        <PlaceRow data={data} thing={thing} count={children.length} onOpen={() => nav.open({ name: "place", key: thing.key })} />
      </li>
      {open && children.map((c) => <Branch key={c.key} data={data} nav={nav} world={world} thing={c} depth={depth + 1} />)}
    </>
  );
}

function PlaceRow({ data, thing, withPath, count, onOpen }: { data: AppData; thing: Thing; withPath?: boolean; count?: number; onOpen: () => void }) {
  const all = thingKindsIn(data.items, thing.world);
  const kinds = all.length > 1 ? all.filter((k) => thing.kinds.includes(k.key)).map((k) => k.name) : []; // one kind says nothing
  const path = withPath ? pathOf(data.items, thing.world, thing.key).slice(0, -1).map((t) => t.name).join(" › ") : "";
  const sub = [kinds.join(", "), path, count ? `${count} inside` : "", thing.summary ?? ""].filter(Boolean).join(" · ");
  return (
    <button onClick={onOpen}>
      <span className="title">{iconOf(data.items, thing)} {thing.name}</span>
      {sub && <span className="sub">{sub}</span>}
    </button>
  );
}

// Name, kind and where it is; everything else on its page.
export function NewPlace({ data, world, save, onMade, inside }: { data: AppData; world: string; save: (items: Item[]) => Promise<void>; onMade: (key: string) => void; inside?: string }) {
  const kinds = thingKindsIn(data.items, world);
  const [name, setName] = useState("");
  // With one kind (the starter's generic Place), every new place has it; with several, the kind most
  // of its new siblings have.
  const [kind, setKind] = useState(kinds.length === 1 ? kinds[0].key : inside ? usualKindInside(data.items, world, inside) : "");
  const [parent, setParentKey] = useState(inside ?? "");
  const places = thingsIn(data.items, world).sort((a, b) => a.name.localeCompare(b.name));
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
      <h2>{inside ? "Add a place inside" : "New place"}</h2>
      <input className="filter" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && make()} />
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
        {!inside && (
          <label className="stack">
            <span className="sub">In</span>
            <select value={parent} onChange={(e) => setParentKey(e.target.value)}>
              <option value="">(the top)</option>
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

// The kind most of a place's contents have, so a new one starts the same (blank if none).
function usualKindInside(items: Item[], world: string, parent: string): string {
  const count = new Map<string, number>();
  for (const c of childrenOf(items, world, parent)) for (const k of c.kinds) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
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
      {maps.length === 0 && <p className="hint">No maps yet. A map here is a blank sheet you pin places on; a picture behind it comes with images.</p>}
      <ul className="list">
        {maps.map((m) => (
          <li key={m.key}>
            <button onClick={() => nav.open({ name: "map", key: m.key })}>
              <span className="title">🗺️ {m.name}</span>
              <span className="sub">{m.pins.length} pinned</span>
            </button>
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

// --- Kinds: kinds of thing, kinds of link, and which link groups places ---------------------------

function Kinds({ data, nav, world, save }: Part) {
  const [name, setName] = useState("");
  const [linkName, setLinkName] = useState("");
  const w = worldOf(data.items, world)!;
  const thingKinds = thingKindsIn(data.items, world);
  const linkKinds = linkKindsIn(data.items, world);
  const addKind = async () => {
    if (!name.trim()) return;
    const key = newKey(data.items, world, "thing-kind", name);
    await save([...data.items, { key, kind: "thing-kind", world, name: name.trim(), fields: [] }]);
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
  const setTree = (key: string) => save(data.items.map((i) => (i.key === world && i.kind === "sandbox" ? { ...i, tree: key || undefined } : i)));

  return (
    <>
      <p className="sub">A world's kinds are its own: change them freely. A kind offers fields; it never forbids any.</p>
      <h2>Kinds of thing</h2>
      <ul className="list">
        {thingKinds.map((k) => (
          <li key={k.key}>
            <button onClick={() => nav.open({ name: "thing-kind", key: k.key })}>
              <span className="title">{k.icon} {k.name}</span>
              <span className="sub">{[k.about, k.fields.map((f) => f.name).join(", ")].filter(Boolean).join(" · ") || "no fields yet"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-add">
        <input className="filter" placeholder="New kind (e.g. Temple)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKind()} />
        <button className="primary" onClick={addKind}>Add</button>
      </div>
      <h2>Kinds of link</h2>
      <ul className="list">
        {linkKinds.map((k) => (
          <li key={k.key}>
            <button onClick={() => nav.open({ name: "link-kind", key: k.key })}>
              <span className="title">{k.name}{k.reverseName ? ` / ${k.reverseName}` : ""}</span>
              <span className="sub">{[k.direction, k.hierarchy === "none" ? "" : k.hierarchy, k.about].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-add">
        <input className="filter" placeholder="New link kind (e.g. road to)" value={linkName} onChange={(e) => setLinkName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLinkKind()} />
        <button className="primary" onClick={addLinkKind}>Add</button>
      </div>
      <h2>Places are grouped by</h2>
      <label className="stack">
        <select value={w.tree ?? ""} onChange={(e) => setTree(e.target.value)}>
          <option value="">(nothing: no tree)</option>
          {linkKinds.filter((k) => k.hierarchy === "one parent").map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
        </select>
        <span className="sub">The link kind that makes the tree of places, their paths and the areas on maps. Only one-parent link kinds can.</span>
      </label>
    </>
  );
}
