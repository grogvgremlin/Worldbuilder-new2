// World → a world item: its entry, read like a wiki page, edited in place.
// Design: design/world-structure.md §1 (a thing with attributes; contents), §2 (several kinds; a
// kind's fields offered, not exclusive; fields named per kind), §3 (links, read from both ends),
// §4 (containment), §5 (the maps it's pinned on), §10 (a list of names).
// The form is worked out from the place's kinds (one definition drives every surface,
// authoring-v2 §5.2); it will join the shared form when Lists' editor brings one.
import { useState, type ReactNode } from "react";
import type { Item, Link, Thing, ThingField, ThingName } from "../../../items/items";
import { linkKindsIn, linksIn, mapsIn, removeThing, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { childrenOf, descendantsOf, firstTree, hiddenByHand, hiddenIn, hideHere, pathOf, setParent, treeKinds } from "../../../world/places";
import { iconOf, mapsShowing } from "../../../world/maps";
import { addToGroup, broughtOptions, effectiveMembers, excludeFromGroup, groupLinkKinds, groupsIn, groupsWithMember, membersOf, removeFromGroup, type Brings } from "../../../world/groups";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NewPlace } from "./WorldScreen";
import { TextBox } from "./text-box";
import { SwipeRow } from "../../swipe";
import { useChosenTree } from "./tree-picker";
import { recalled, rememberAll, useRemembered } from "./remembered";
import { fitsTree, kindLine, kindTree, refusal } from "../../../world/kinds";
import { fieldSummary, join, linksFrom, offersFor, removeLink, type Offer } from "../../../world/links";
import { JoinChoices } from "./JoinPopup";

export function PlaceScreen({ data, nav, thingKey }: { data: AppData; nav: Nav; thingKey: string }) {
  const [editing, setEditing] = useState(false);
  const [epoch, setEpoch] = useState(0); // bumped by Fold all / Open all: the sections redraw
  const [, setChanged] = useState(0);
  const thing = data.items.find((i): i is Thing => i.kind === "thing" && i.key === thingKey);
  const [viewed] = useChosenTree(data, thing?.world ?? "");
  if (!thing) return <p className="hint">This item isn't in the world any more.</p>;
  const world = thing.world;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));
  const change = (patch: Partial<Thing>) => save(data.items.map((i) => (i.key === thing.key ? ({ ...thing, ...patch } as Thing) : i)));
  // The trail under the name follows the tree being viewed (owner, 26 Nov), else the main tree.
  const main = firstTree(data.items, world);
  const viewedPath = viewed ? pathOf(data.items, world, thing.key, viewed).slice(0, -1) : [];
  const trailTree = viewedPath.length > 0 ? viewed : main;
  const path = trailTree ? pathOf(data.items, world, thing.key, trailTree).slice(0, -1) : [];
  const trailLabel = trailTree && trailTree !== main ? linkKindsIn(data.items, world).find((k) => k.key === trailTree)?.name : undefined;

  return (
    <article className="card place" key={epoch}>
      <div className="place-head">
        {editing ? (
          <TextBox className="icon-box" value={thing.icon ?? ""} placeholder={iconOf(data.items, thing)} onSave={(v) => change({ icon: v || undefined })} />
        ) : (
          <span className="place-icon">{iconOf(data.items, thing)}</span>
        )}
        <div className="place-title">
          {editing ? <TextBox className="name-box" value={thing.name} onSave={(v) => v && change({ name: v })} /> : <h1>{thing.name}</h1>}
          {/* Editing: where it is, as a dropdown per tree (the read-only trail would say it twice). */}
          {!editing && <Breadcrumb nav={nav} path={path} label={trailLabel} />}
        </div>
        <button className="link edit-toggle" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
      </div>
      {/* Editing: where it is, a labelled row per tree, full width (owner, 26 Nov). */}
      <span className="fold-all">
        <button className="link" onClick={() => (rememberAll("item-fold|", false), setEpoch((n) => n + 1))}>Fold all</button> ·{" "}
        <button className="link" onClick={() => (rememberAll("item-fold|", true), setEpoch((n) => n + 1))}>Open all</button>
      </span>

      <Kinds data={data} thing={thing} editing={editing} change={change} />
      {editing && (
        // How it shows as an area on maps (owner, 26 Nov: "a colour option for containers").
        <label className="colour-row">
          <span className="sub">Area colour on maps</span>
          <input type="color" value={thing.colour ?? "#8a6d3b"} onChange={(e) => change({ colour: e.target.value })} />
          {thing.colour && <button className="link" onClick={() => change({ colour: undefined })}>Use the default</button>}
        </label>
      )}

      {/* The owner's layout (26 Nov mock-up): two folding groups, each section folding inside. */}
      <Fold id="wiki" title="Wiki entry" big>
        <Fold id="entry" title="Entry" show={editing || Boolean(thing.summary || thing.description)}>
          {editing ? (
            <>
              <TextBox className="filter" value={thing.summary ?? ""} placeholder="One line: what it is" onSave={(v) => change({ summary: v || undefined })} />
              <TextBox multiline className="description-box" value={thing.description ?? ""} placeholder="Its entry: history, look, people, rumours…" onSave={(v) => change({ description: v || undefined })} />
            </>
          ) : (
            <>
              {thing.summary && <p className="summary">{thing.summary}</p>}
              {thing.description && <div className="description">{thing.description}</div>}
            </>
          )}
        </Fold>
        {!editing && !thing.summary && !thing.description && <p className="sub">No entry yet: Edit to write one.</p>}
        <Fields data={data} thing={thing} editing={editing} change={change} />
        <OtherNames thing={thing} editing={editing} change={change} />
      </Fold>

      {(editing || (thing.tags ?? []).length > 0) && (
        <section>
          <h2>Tags</h2>
          {editing ? (
            <TextBox className="filter" value={(thing.tags ?? []).join(", ")} placeholder="Comma between tags" onSave={(v) => change({ tags: splitList(v) })} />
          ) : (
            <div className="chips static">{(thing.tags ?? []).map((t) => <span key={t} className="chip">{t}</span>)}</div>
          )}
        </section>
      )}

      <Fold id="where" title="Where it sits" big>
        <WhereItSits data={data} nav={nav} thing={thing} editing={editing} save={save} />
        <Connections data={data} nav={nav} thing={thing} editing={editing} save={save} />
        <OnMaps data={data} nav={nav} thing={thing} />
      </Fold>

      {(editing || thing.reference) && (
        <section>
          <h2>Source</h2>
          {editing ? (
            <div className="row-fields">
              <TextBox className="filter" value={thing.reference?.source ?? ""} placeholder="Book or source" onSave={(v) => change({ reference: v ? { source: v, page: thing.reference?.page } : undefined })} />
              <TextBox className="filter page-box" value={thing.reference?.page ?? ""} placeholder="Page" onSave={(v) => thing.reference && change({ reference: { source: thing.reference.source, page: v || undefined } })} />
            </div>
          ) : (
            <p>{thing.reference!.source}{thing.reference!.page ? `, p. ${thing.reference!.page}` : ""}</p>
          )}
        </section>
      )}
      <Fold id="notes" title="Notes" show={editing || Boolean(thing.notes)}>
        {editing ? (
          <TextBox multiline className="description-box" value={thing.notes ?? ""} placeholder="Your own notes" onSave={(v) => change({ notes: v || undefined })} />
        ) : (
          <div className="description">{thing.notes}</div>
        )}
      </Fold>

      {editing && (
        <div className="buttons">
          <button className="danger" onClick={async () => {
            const held = childrenOf(data.items, world, thing.key).length;
            if (!confirm(`Remove ${thing.name}?${held ? ` The ${held} item${held > 1 ? "s" : ""} inside it move up to sit straight in the world.` : ""}`)) return;
            await data.setItems(removeThing(data.items, thing.key));
            nav.back();
          }}>Remove {thing.name}</button>
        </div>
      )}
    </article>
  );
}

// A section that folds (owner, 26 Nov mock-up: the arrows); remembered while the app is open.
// `big` is one of the two groups (Wiki entry; Where it sits). `show` false: not drawn at all.
function Fold({ id, title, big, show = true, children }: { id: string; title: string; big?: boolean; show?: boolean; children: ReactNode }) {
  const [open, setOpen] = useRemembered(`item-fold|${id}`, recalled(`item-fold|${id}`, "item-fold|", true));
  if (!show) return null;
  return (
    <details className={big ? "item-fold big" : "item-fold"} open={open} onToggle={(e) => e.target === e.currentTarget && setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{title}</summary>
      <div className="item-fold-body">{children}</div>
    </details>
  );
}

function Breadcrumb({ nav, path, label }: { nav: Nav; path: Thing[]; label?: string }) {
  if (path.length === 0) return null;
  return (
    <div className="breadcrumb">
      {label ? `${label}: ` : "in "}
      {path.map((t, n) => (
        <span key={t.key}>
          {n > 0 && " › "}
          <button className="link" onClick={() => nav.open({ name: "place", key: t.key })}>{t.name}</button>
        </span>
      ))}
    </div>
  );
}

// Kinds as chips; editing, every kind of the world to switch on or off, flavours after their kind.
function Kinds({ data, thing, editing, change }: { data: AppData; thing: Thing; editing: boolean; change: (p: Partial<Thing>) => void }) {
  const kinds = kindTree(data.items, thing.world).map((k) => k.kind);
  if (kinds.length <= 1) return null; // one generic kind: nothing to show or choose
  const shown = editing ? kinds : kinds.filter((k) => thing.kinds.includes(k.key));
  if (shown.length === 0) return null;
  const toggle = (key: string) => change({ kinds: thing.kinds.includes(key) ? thing.kinds.filter((k) => k !== key) : [...thing.kinds, key] });
  return (
    <div className={editing ? "chips" : "chips static"}>
      {shown.map((k) =>
        editing ? (
          <button key={k.key} className={thing.kinds.includes(k.key) ? "on" : ""} onClick={() => toggle(k.key)}>{k.icon} {k.name}</button>
        ) : (
          <span key={k.key} className="chip">{k.icon} {k.name}</span>
        ),
      )}
    </div>
  );
}

// Where it is, in each of the world's trees (owner, 25 Nov: by province, by terrain …): any item but
// itself and what it holds there.
// Fields, under each of its kinds (fields are named per kind), then its one-offs.
function Fields({ data, thing, editing, change }: { data: AppData; thing: Thing; editing: boolean; change: (p: Partial<Thing>) => void }) {
  const [newField, setNewField] = useState("");
  // Its kinds and the kinds they're flavours of, each once, parents first: their fields, by kind.
  const kinds = [...new Map(thing.kinds.flatMap((k) => kindLine(data.items, thing.world, k).reverse()).map((k) => [k.key, k])).values()];
  const valueOf = (of: string | undefined, field: string) => thing.fields.find((f) => f.of === of && f.field === field)?.value ?? "";
  const setValue = (of: string | undefined, field: string, value: string) => {
    const rest = thing.fields.filter((f) => !(f.of === of && f.field === field));
    const next: ThingField = of ? { of, field, value } : { field, value };
    change({ fields: value ? [...rest, next] : rest });
  };
  const offered = new Set(kinds.flatMap((k) => k.fields.map((f) => `${k.key}|${f.name}`)));
  // Filled in under a kind the thing no longer has, or not offered by its kind: shown as they are.
  const others = thing.fields.filter((f) => !f.of || !offered.has(`${f.of}|${f.field}`));
  const groups = kinds.map((k) => ({ title: kinds.length > 1 ? k.name : "", of: k.key as string | undefined, fields: k.fields.map((f) => ({ name: f.name, about: f.about })) }));
  const rows = groups.map((g) => ({ ...g, fields: editing ? g.fields : g.fields.filter((f) => valueOf(g.of, f.name)) })).filter((g) => g.fields.length > 0);
  if (!editing && rows.length === 0 && others.length === 0) return null;

  return (
    <Fold id="details" title="Details">
      {rows.map((g) => (
        <div key={g.of}>
          {g.title && <div className="sub field-group">{g.title}</div>}
          {g.fields.map((f) => (
            <div className="field" key={f.name}>
              <span className="label">{f.name}</span>
              {editing ? <TextBox className="field-box" value={valueOf(g.of, f.name)} placeholder={f.about ?? ""} onSave={(v) => setValue(g.of, f.name, v)} /> : <span>{valueOf(g.of, f.name)}</span>}
            </div>
          ))}
        </div>
      ))}
      {others.map((f) => (
        <div className="field" key={`${f.of}|${f.field}`}>
          <span className="label">{f.field}</span>
          {editing ? <TextBox className="field-box" value={f.value} placeholder="(blank removes it)" onSave={(v) => setValue(f.of, f.field, v)} /> : <span>{f.value}</span>}
        </div>
      ))}
      {editing && (
        <div className="inline-add">
          <input className="filter" placeholder="Another field, just for this item" value={newField} onChange={(e) => setNewField(e.target.value)} />
          <button disabled={!newField.trim()} onClick={() => (setValue(undefined, newField.trim(), "?"), setNewField(""))}>Add</button>
        </div>
      )}
    </Fold>
  );
}

// Its other names (§10): language, era, kind of name. Search finds a place by any of them.
function OtherNames({ thing, editing, change }: { thing: Thing; editing: boolean; change: (p: Partial<Thing>) => void }) {
  const names = thing.otherNames ?? [];
  const [draft, setDraft] = useState<ThingName>({ name: "" });
  if (!editing && names.length === 0) return null;
  const describe = (n: ThingName) => [n.nameKind, n.language, n.era, n.source].filter(Boolean).join(", ");
  const add = () => {
    if (!draft.name.trim()) return;
    const clean: ThingName = { name: draft.name.trim() };
    for (const k of ["language", "era", "nameKind", "source"] as const) if (draft[k]?.trim()) clean[k] = draft[k]!.trim();
    change({ otherNames: [...names, clean] });
    setDraft({ name: "" });
  };
  return (
    <Fold id="names" title="Other names">
      <ul className="plain">
        {names.map((n, i) => (
          <li key={i}>
            <b>{n.name}</b>{describe(n) && <span className="sub"> · {describe(n)}</span>}
            {editing && <button className="link remove-x" aria-label="Remove" onClick={() => change({ otherNames: names.filter((_, j) => j !== i) })}>✕</button>}
          </li>
        ))}
      </ul>
      {editing && (
        <div className="name-add">
          <div className="inline-add">
            <input className="filter" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button disabled={!draft.name.trim()} onClick={add}>Add</button>
          </div>
          <div className="row-fields">
            <input className="filter" placeholder="Kind (common, old…)" value={draft.nameKind ?? ""} onChange={(e) => setDraft({ ...draft, nameKind: e.target.value })} />
            <input className="filter" placeholder="Language" value={draft.language ?? ""} onChange={(e) => setDraft({ ...draft, language: e.target.value })} />
            <input className="filter" placeholder="Era" value={draft.era ?? ""} onChange={(e) => setDraft({ ...draft, era: e.target.value })} />
          </div>
        </div>
      )}
    </Fold>
  );
}

// --- Where it sits: a section per tree, then groups (owner, 26 Nov) --------------------------------
// Each tree's section holds everything for that tree: where the item is (in edit, a dropdown: loose,
// hidden from this tree, or a container) and what it holds. Read mode shows the same, as tappable
// links or as thumbnails (one switch for the whole card, remembered).

type Display = "links" | "thumbs";
type SectionPart = { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void>; display: Display };

// The items in a list: a tappable chain (links) or rows (thumbnails), each optionally with a note and
// a swipe action.
function ItemsShown({ data, nav, things, display, note, action }: { data: AppData; nav: Nav; things: Thing[]; display: Display; note?: (t: Thing) => string; action?: { label: string; run: (t: Thing) => void } }) {
  if (things.length === 0) return null;
  if (display === "links") {
    return (
      <p className="link-list">
        {things.map((t, n) => (
          <span key={t.key}>
            {n > 0 && ", "}
            <button className="link" onClick={() => nav.open({ name: "place", key: t.key })}>{t.name}</button>
            {note?.(t) && <span className="sub"> ({note(t)})</span>}
          </span>
        ))}
      </p>
    );
  }
  return (
    <ul className="list">
      {things.map((t) => {
        const row = (
          <button onClick={() => nav.open({ name: "place", key: t.key })}>
            <span className="title">{iconOf(data.items, t)} {t.name}</span>
            {(note?.(t) || t.summary) && <span className="sub">{[note?.(t), t.summary].filter(Boolean).join(" · ")}</span>}
          </button>
        );
        return <li key={t.key}>{action ? <SwipeRow action={action.label} onAction={() => action.run(t)}>{row}</SwipeRow> : row}</li>;
      })}
    </ul>
  );
}

function WhereItSits({ data, nav, thing, editing, save }: Omit<SectionPart, "display">) {
  const [display, setDisplay] = useRemembered<Display>("item-display", "thumbs");
  const trees = treeKinds(data.items, thing.world);
  // A tree's section shows if the item fits it, sits in it, or holds something in it.
  const shown = trees.filter((k) => fitsTree(data.items, thing.world, k.key, thing.key) || pathOf(data.items, thing.world, thing.key, k.key).length > 1 || childrenOf(data.items, thing.world, thing.key, k.key).length > 0);
  const left = trees.filter((k) => !shown.includes(k));
  return (
    <>
      <nav className="segments small display-switch">
        <button className={display === "links" ? "on" : ""} onClick={() => setDisplay("links")}>Links</button>
        <button className={display === "thumbs" ? "on" : ""} onClick={() => setDisplay("thumbs")}>Thumbnails</button>
      </nav>
      {shown.map((k) => <TreeSection key={k.key} data={data} nav={nav} thing={thing} editing={editing} save={save} display={display} tree={k.key} treeName={k.name} />)}
      {left.length > 0 && <p className="sub">Not in {left.map((k) => `"${k.name}"`).join(", ")}: it doesn't fit what {left.length === 1 ? "that tree takes" : "those trees take"}.</p>}
      <GroupsSection data={data} nav={nav} thing={thing} editing={editing} save={save} display={display} />
    </>
  );
}

const LOOSE = "";
const HIDDEN = "(hidden)";

function TreeSection({ data, nav, thing, editing, save, display, tree, treeName }: SectionPart & { tree: string; treeName: string }) {
  const world = thing.world;
  const path = pathOf(data.items, world, thing.key, tree).slice(0, -1);
  const children = childrenOf(data.items, world, thing.key, tree);
  const fits = fitsTree(data.items, world, tree, thing.key);
  const hidden = hiddenIn(data.items, world, tree, thing.key);
  // Hidden from this tree, it holds nothing here (owner, 27 Nov): only loose or a container shows it.
  const canHold = !refusal(data.items, world, tree, "to", thing.key) && hidden !== "by hand";
  const kind = linkKindsIn(data.items, world).find((k) => k.key === tree);
  const holdsWord = kind?.reverseName ? `${kind.reverseName[0].toUpperCase()}${kind.reverseName.slice(1)}` : "Holds";
  const inside = new Set(descendantsOf(data.items, world, thing.key, tree).map((t) => t.key));
  const containers = thingsIn(data.items, world).filter((t) => t.key !== thing.key && !inside.has(t.key) && !refusal(data.items, world, tree, "to", t.key) && !hiddenByHand(data.items, tree, t.key));
  const label = (t: Thing) => pathOf(data.items, world, t.key, tree).map((p) => p.name).join(" › ");
  const above = new Set(pathOf(data.items, world, thing.key, tree).map((t) => t.key));
  const movable = thingsIn(data.items, world)
    .filter((t) => !above.has(t.key) && !children.some((c) => c.key === t.key) && !refusal(data.items, world, tree, "from", t.key))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Where it is: loose, hidden from this tree, or inside a container (owner, 26 Nov: "just add a
  // hidden option in the drop down").
  const place = async (to: string) => {
    let items = data.items;
    if (to === HIDDEN) {
      items = setParent(items, world, thing.key, null, tree).items;
      return save(hideHere(items, tree, thing.key, true));
    }
    if (hidden === "by hand") items = hideHere(items, tree, thing.key, false);
    const result = setParent(items, world, thing.key, to || null, tree);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const bringIn = async (key: string) => {
    const result = setParent(data.items, world, key, thing.key, tree);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const where = hidden ? `hidden from this tree${hidden === "loose hidden" ? " (it hides loose items)" : ""}` : path.length === 0 ? "loose: straight in the world" : null;
  // Read mode: a tree with nothing to say (loose, holding nothing, not hidden) isn't shown.
  if (!editing && fits && !hidden && path.length === 0 && children.length === 0) return null;

  return (
    <Fold id={`tree|${tree}`} title={`${treeName}${children.length ? ` · ${holdsWord.toLowerCase()} ${children.length}` : ""}`}>
      <div className="sub field-group">Where it is</div>
      {!fits && (
        <p className="sub warn">
          Doesn't fit what "{treeName}" takes · <button className="link" onClick={() => nav.open({ name: "link-kind", key: tree })}>Change what it takes</button>
          {path.length > 0 && editing && <> · <button className="link" onClick={() => place(LOOSE)}>Take it out</button></>}
        </p>
      )}
      {editing && fits ? (
        <select className="tree-select" value={hidden === "by hand" ? HIDDEN : path[path.length - 1]?.key ?? LOOSE} onChange={(e) => place(e.target.value)}>
          <option value={LOOSE}>(loose: straight in the world)</option>
          <option value={HIDDEN} disabled={children.length > 0}>(hidden from this tree{children.length > 0 ? `: take out what it ${holdsWord.toLowerCase()} first` : ""})</option>
          {containers.map((t) => ({ t, name: label(t) })).sort((a, b) => a.name.localeCompare(b.name)).map(({ t, name }) => <option key={t.key} value={t.key}>{name}</option>)}
        </select>
      ) : where ? (
        <p className="sub">{where}</p>
      ) : display === "links" ? (
        <Breadcrumb nav={nav} path={path} />
      ) : (
        <ItemsShown data={data} nav={nav} things={path} display="thumbs" />
      )}
      {hidden === "by hand" && editing && <p className="sub">Hidden from this tree, it {holdsWord.toLowerCase()} nothing here: choose loose or a container to show it.</p>}
      {hidden === "loose hidden" && editing && <p className="sub warn">"{treeName}" hides loose items · <button className="link" onClick={() => nav.open({ name: "link-kind", key: tree })}>Show them</button> or put it in a container</p>}

      {(children.length > 0 || (editing && canHold)) && <div className="sub field-group">{holdsWord} ({children.length})</div>}
      {editing && canHold && (
        <>
          <select className="tree-select" value="" onChange={(e) => e.target.value && bringIn(e.target.value)}>
            <option value="">Move an item in here…</option>
            {movable.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <Fold id={`add-inside|${tree}`} title="Add an item inside">
            <NewPlace data={data} world={world} save={async (items) => save(items)} inside={thing.key} insideTree={tree} onMade={() => undefined} />
          </Fold>
        </>
      )}
      <ItemsShown
        data={data}
        nav={nav}
        things={children}
        display={display}
        note={(c) => (childrenOf(data.items, world, c.key, tree).length ? `${childrenOf(data.items, world, c.key, tree).length} inside` : "")}
        action={{ label: "Take out", run: (c) => save(setParent(data.items, world, c.key, null, tree).items) }}
      />
    </Fold>
  );
}

// --- Groups: the groups it's in, and (as a group) its members ---------------------------------------
// A member can bring what it holds: a container its contents in one tree, a group its members
// (owner, 26 Nov). The group's members are worked out from that each time; any brought in can be left
// out.

function GroupsSection({ data, nav, thing, editing, save, display }: SectionPart) {
  const world = thing.world;
  const kinds = groupLinkKinds(data.items, world);
  if (kinds.length === 0) return null;
  const linkKind = kinds[0].key;
  const inGroups = groupsWithMember(data.items, world, thing.key);
  const members = effectiveMembers(data.items, world, thing.key);
  const direct = membersOf(data.items, world, thing.key);
  const excluded = thingsIn(data.items, world).filter((t) => (thing.excludedMembers ?? []).includes(t.key));
  const canJoin = !refusal(data.items, world, linkKind, "from", thing.key);
  const canGroup = !refusal(data.items, world, linkKind, "to", thing.key);
  if (!editing && inGroups.length === 0 && members.length === 0) return null;
  const treesOf = treeKinds(data.items, world).map((k) => ({ key: k.key, name: k.name }));

  const groupChoices = thingsIn(data.items, world)
    .filter((t) => t.key !== thing.key && !inGroups.some((g) => g.group.key === t.key) && !refusal(data.items, world, linkKind, "to", t.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  const join = async (group: string) => {
    const result = addToGroup(data.items, world, thing.key, linkKind, group);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const leave = async (group: Thing, via: Thing | null) => {
    if (via) return save(excludeFromGroup(data.items, group.key, thing.key, true)); // brought in: left out of that group
    const link = membersOf(data.items, world, group.key).find((m) => m.thing.key === thing.key);
    if (link) await save(removeFromGroup(data.items, world, thing.key, link.linkKind.key, group.key));
  };
  const viaNote = (via: Thing | null) => (via ? `via ${via.name}` : "");

  return (
    <Fold id="groups" title={`Groups${inGroups.length ? ` · in ${inGroups.length}` : ""}${members.length ? ` · ${members.length} members` : ""}`}>
      {(inGroups.length > 0 || (editing && canJoin)) && <div className="sub field-group">Groups it's in ({inGroups.length})</div>}
      {editing && canJoin && (
        <select className="tree-select" value="" onChange={(e) => e.target.value && join(e.target.value)}>
          <option value="">Put it in a group…</option>
          {groupChoices.map((t) => <option key={t.key} value={t.key}>{t.name}{groupsIn(data.items, world).some((g) => g.key === t.key) ? "" : " (makes it a group)"}</option>)}
        </select>
      )}
      <ItemsShown
        data={data}
        nav={nav}
        things={inGroups.map((g) => g.group)}
        display={display}
        note={(g) => viaNote(inGroups.find((x) => x.group.key === g.key)?.via ?? null)}
        action={{ label: "Leave", run: (g) => leave(g, inGroups.find((x) => x.group.key === g.key)?.via ?? null) }}
      />

      {(members.length > 0 || (editing && canGroup)) && <div className="sub field-group">Members of this group ({members.length})</div>}
      {editing && canGroup && <AddMember data={data} world={world} group={thing} linkKind={linkKind} treesOf={treesOf} save={save} />}
      {direct.length > 0 && (
        <>
          {members.length > direct.length && <p className="sub">Added: {direct.map((m) => `${m.thing.name}${scopeWords(m.link, treesOf)}`).join(", ")}</p>}
          <ItemsShown
            data={data}
            nav={nav}
            things={members.map((m) => m.thing)}
            display={display}
            note={(t) => {
              const m = members.find((x) => x.thing.key === t.key)!;
              return m.via ? `via ${m.via.name}` : scopeWords(m.link, treesOf).trim();
            }}
            action={{
              label: "Take out",
              run: (t) => {
                const m = members.find((x) => x.thing.key === t.key)!;
                if (m.via || !m.link) return save(excludeFromGroup(data.items, thing.key, t.key, true)); // brought in: left out
                save(removeFromGroup(data.items, world, t.key, m.link.linkKind, thing.key));
              },
            }}
          />
        </>
      )}
      {excluded.length > 0 && (
        <p className="sub">
          Left out: {excluded.map((t, n) => (
            <span key={t.key}>{n > 0 && ", "}{t.name} <button className="link" onClick={() => save(excludeFromGroup(data.items, thing.key, t.key, false))}>put back</button></span>
          ))}
        </p>
      )}
    </Fold>
  );
}

// "with everything inside it in 'in'" / "with its members", for a membership that brings more.
function scopeWords(link: Link | null, treesOf: { key: string; name: string }[]): string {
  if (!link?.brings) return "";
  if (link.brings === "members") return " with its members";
  return ` with everything inside it in "${treesOf.find((t) => t.key === link.broughtFrom)?.name ?? "?"}"`;
}

// Adds a member: pick the item, then, if it holds things or is a group, say what it brings (alone,
// its contents in one tree, its members). Asked only when there's a choice (owner, 26 Nov).
function AddMember({ data, world, group, linkKind, treesOf, save }: { data: AppData; world: string; group: Thing; linkKind: string; treesOf: { key: string; name: string }[]; save: (items: Item[]) => Promise<void> }) {
  const [picked, setPicked] = useState("");
  const existing = new Set(membersOf(data.items, world, group.key).map((m) => m.thing.key));
  const choices = thingsIn(data.items, world)
    .filter((t) => t.key !== group.key && !existing.has(t.key) && !refusal(data.items, world, linkKind, "from", t.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  const add = async (key: string, scope?: Brings) => {
    const result = addToGroup(data.items, world, key, linkKind, group.key, scope);
    setPicked("");
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const choose = (key: string) => {
    if (!key) return;
    if (broughtOptions(data.items, world, key, treesOf).length === 0) return add(key);
    setPicked(key);
  };
  const options = picked ? broughtOptions(data.items, world, picked, treesOf) : [];
  const pickedName = thingsIn(data.items, world).find((t) => t.key === picked)?.name;
  return (
    <>
      <select className="tree-select" value="" onChange={(e) => choose(e.target.value)}>
        <option value="">{membersOf(data.items, world, group.key).length ? "Add a member…" : "Add a member (makes this a group)…"}</option>
        {choices.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
      </select>
      {picked && (
        <div className="scope-choice">
          <span className="sub">Add {pickedName}:</span>
          <button onClick={() => add(picked)}>alone</button>
          {options.map((o) => <button key={o.label} onClick={() => add(picked, o.scope)}>{o.label}</button>)}
          <button className="link" onClick={() => setPicked("")}>Cancel</button>
        </div>
      )}
    </>
  );
}

// Connections: its plain links (not a tree, not a group), read from this end: "rules" one way,
// "ruled by" the other. Editing, a picker at the top joins it to another item, ends first (owner,
// 27 Nov): the link kinds that fit, then the rest with the reason. Swipe a row left to remove it.
function Connections({ data, nav, thing, editing, save }: { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void> }) {
  const world = thing.world;
  const [other, setOther] = useState("");
  const names = new Map(thingsIn(data.items, world).map((t) => [t.key, t.name]));
  const rows = linksFrom(data.items, world, thing.key);
  if (rows.length === 0 && !editing) return null;
  const others = thingsIn(data.items, world).filter((t) => t.key !== thing.key).sort((a, b) => a.name.localeCompare(b.name));
  const pick = async (offer: Offer) => {
    const result = join(data.items, world, thing.key, offer.kind.key, other);
    if (result.problem) return alert(result.problem);
    await save(result.items);
    setOther("");
  };
  return (
    <Fold id="links" title={`Connections${rows.length ? ` (${rows.length})` : ""}`}>
      {editing && (
        <>
          <select className="tree-select" value={other} onChange={(e) => setOther(e.target.value)}>
            <option value="">Join to…</option>
            {others.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          {other && <JoinChoices data={data} offers={offersFor(data.items, world, thing.key, other)} from={thing.name} to={names.get(other) ?? other} onPick={pick} />}
        </>
      )}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.link.key}>
            <SwipeRow action="Remove" onAction={() => save(removeLink(data.items, r.link.key))}>
              <button onClick={() => nav.open({ name: "link", key: r.link.key })}>
                <span className="title"><span className="link-word">{r.word}</span> {names.get(r.other) ?? r.other}</span>
                {(r.link.fields?.length || r.link.start || r.link.end) && <span className="sub">{[fieldSummary(data.items, r.link, thing.key), dates(r.link)].filter(Boolean).join(" · ")}</span>}
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="sub">Not joined to anything yet.</p>}
    </Fold>
  );
}

// A link's dates as written: "2502–2512", "from 2502", "until 2512".
function dates(link: Link): string {
  if (link.start && link.end) return `${link.start}–${link.end}`;
  if (link.start) return `from ${link.start}`;
  if (link.end) return `until ${link.end}`;
  return "";
}

// The maps it's pinned on; or pin it on one.
function OnMaps({ data, nav, thing }: { data: AppData; nav: Nav; thing: Thing }) {
  const on = mapsShowing(data.items, thing.key);
  const others = mapsIn(data.items, thing.world).filter((m) => !on.some((o) => o.key === m.key));
  return (
    <Fold id="maps" title={`On maps (${on.length})`}>
      {others.length > 0 && (
        <label className="stack">
          <select value="" onChange={(e) => e.target.value && nav.open({ name: "map", key: e.target.value, place: thing.key })}>
            <option value="">Pin it on a map…</option>
            {others.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          </select>
        </label>
      )}
      {on.length === 0 && <p className="sub">Not on any map yet.</p>}
      <ul className="plain">
        {on.map((m) => (
          <li key={m.key}><button className="link" onClick={() => nav.open({ name: "map", key: m.key, focus: thing.key })}>🗺️ {m.name}</button></li>
        ))}
      </ul>
    </Fold>
  );
}

function splitList(text: string): string[] | undefined {
  const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}
