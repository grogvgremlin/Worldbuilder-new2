// World → a world item: its entry, read like a wiki page, edited in place.
// Design: design/world-structure.md §1 (a thing with attributes; contents), §2 (several kinds; a
// kind's fields offered, not exclusive; fields named per kind), §3 (links, read from both ends),
// §4 (containment), §5 (the maps it's pinned on), §10 (a list of names).
// The form is worked out from the place's kinds (one definition drives every surface,
// authoring-v2 §5.2); it will join the shared form when Lists' editor brings one.
import { useState, type ReactNode } from "react";
import type { Item, Thing, ThingField, ThingName } from "../../../items/items";
import { linkKindsIn, linksIn, mapsIn, removeThing, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { childrenOf, descendantsOf, firstTree, hiddenIn, hideHere, pathOf, setParent, treeKinds } from "../../../world/places";
import { iconOf, mapsShowing } from "../../../world/maps";
import { addToGroup, groupLinkKinds, groupsIn, groupsOf, membersOf, removeFromGroup, type Membership } from "../../../world/groups";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NewPlace } from "./WorldScreen";
import { TextBox } from "./text-box";
import { SwipeRow } from "../../swipe";
import { useChosenTree } from "./tree-picker";
import { recalled, rememberAll, useRemembered } from "./remembered";
import { fitsTree, kindLine, kindTree, refusal } from "../../../world/kinds";

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
      {editing && <Parents data={data} nav={nav} thing={thing} editing save={save} />}
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
        <Contents data={data} nav={nav} thing={thing} editing={editing} save={save} />
        <Members data={data} nav={nav} thing={thing} editing={editing} save={save} />
        <InGroups data={data} nav={nav} thing={thing} editing={editing} save={save} />
        <AllLinks data={data} nav={nav} thing={thing} />
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
    <details className={big ? "item-fold big" : "item-fold"} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
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
function Parents({ data, nav, thing, editing, save }: { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void> }) {
  const trees = treeKinds(data.items, thing.world);
  if (trees.length === 0) return editing ? <p className="sub">This world has no tree link kind (World → Kinds).</p> : null;
  if (!editing) return null; // read, the trail and Links show where it sits
  // A row per tree it fits, or already sits in (owner, 26 Nov: "what about the other viable trees"):
  // each labelled with its tree, in the world's order.
  const rows = trees.filter((k) => fitsTree(data.items, thing.world, k.key, thing.key) || pathOf(data.items, thing.world, thing.key, k.key).length > 1);
  return (
    <div className="parents">
      <div className="sub field-group">Where it is</div>
      {rows.map((k) => <TreeParent key={k.key} data={data} nav={nav} thing={thing} tree={k.key} label={k.name} save={save} />)}
      {rows.length < trees.length && <p className="sub">Not in {trees.filter((k) => !rows.includes(k)).map((k) => `"${k.name}"`).join(", ")}: it doesn't fit what {rows.length === trees.length - 1 ? "that tree takes" : "those trees take"}.</p>}
    </div>
  );
}

function TreeParent({ data, nav, thing, tree, label, save }: { data: AppData; nav: Nav; thing: Thing; tree: string; label: string; save: (items: Item[]) => Promise<void> }) {
  const world = thing.world;
  const path = pathOf(data.items, world, thing.key, tree).slice(0, -1);
  const current = path[path.length - 1]?.key ?? "";
  const fits = fitsTree(data.items, world, tree, thing.key);
  const hidden = hiddenIn(data.items, world, tree, thing.key);
  const openKind = () => nav.open({ name: "link-kind", key: tree });
  if (!fits) {
    // It sits in this tree but no longer fits what it takes (a rule changed): say so, and offer the way out.
    return (
      <div className="tree-row misfit">
        <span className="tree-label">{label}:</span> {path.map((t) => t.name).join(" › ")}
        <div className="sub warn">
          Doesn't fit what "{label}" takes · <button className="link" onClick={openKind}>Change what it takes</button> ·{" "}
          <button className="link" onClick={async () => save(setParent(data.items, world, thing.key, null, tree).items)}>Take it out</button>
        </div>
      </div>
    );
  }
  const inside = new Set(descendantsOf(data.items, world, thing.key, tree).map((t) => t.key));
  const choices = thingsIn(data.items, world).filter((t) => t.key !== thing.key && !inside.has(t.key) && !refusal(data.items, world, tree, "to", t.key));
  const name = (t: Thing) => pathOf(data.items, world, t.key, tree).map((p) => p.name).join(" › ");
  const move = async (to: string) => {
    if (!to) {
      // Loose: straight in the world, and shown in this tree again if it was hidden by hand.
      let items = setParent(data.items, world, thing.key, null, tree).items;
      if (hidden === "by hand") items = hideHere(items, tree, thing.key, false);
      return save(items);
    }
    const result = setParent(data.items, world, thing.key, to, tree);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  return (
    <label className="tree-row">
      <span className="tree-label">{label}:</span>
      <select value={current} onChange={(e) => move(e.target.value)}>
        <option value="">(loose: straight in the world)</option>
        {choices.map((t) => ({ t, name: name(t) })).sort((a, b) => a.name.localeCompare(b.name)).map(({ t, name }) => <option key={t.key} value={t.key}>{name}</option>)}
      </select>
      {hidden === "by hand" && (
        <span className="sub warn">
          Hidden from "{label}" · <button className="link" onClick={async (e) => (e.preventDefault(), save(hideHere(data.items, tree, thing.key, false)))}>Show it here</button>
        </span>
      )}
      {hidden === "loose hidden" && (
        <span className="sub warn">
          "{label}" hides loose items · <button className="link" onClick={(e) => (e.preventDefault(), openKind())}>Show them</button> or put it in a container
        </span>
      )}
    </label>
  );
}

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

// What it holds: open one; add a new place inside; or put an existing place in here.
function Contents({ data, nav, thing, editing, save }: { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void> }) {
  // What it holds in each tree, in the world's order (owner, 26 Nov: a fortress put in Hill country
  // by "in (terrain)" shows under Hill country).
  const trees = treeKinds(data.items, thing.world);
  const several = trees.length > 1;
  return (
    <>
      {trees.map((k) => <HoldsIn key={k.key} data={data} nav={nav} thing={thing} editing={editing} save={save} tree={k.key} treeName={several ? k.name : undefined} />)}
    </>
  );
}

function HoldsIn({ data, nav, thing, editing, save, tree, treeName }: { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void>; tree: string; treeName?: string }) {
  const world = thing.world;
  const children = childrenOf(data.items, world, thing.key, tree);
  const above = new Set(pathOf(data.items, world, thing.key, tree).map((t) => t.key));
  const canHold = !refusal(data.items, world, tree, "to", thing.key); // a Person holds nothing by "in"
  if ((!editing || !canHold) && children.length === 0) return null;
  const movable = thingsIn(data.items, world)
    .filter((t) => !above.has(t.key) && !children.some((c) => c.key === t.key) && !refusal(data.items, world, tree, "from", t.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  const bringIn = async (key: string) => {
    const result = setParent(data.items, world, key, thing.key, tree);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const reverse = linkKindsIn(data.items, world).find((k) => k.key === tree)?.reverseName;
  const word = reverse ? `${reverse[0].toUpperCase()}${reverse.slice(1)}` : "Contains";
  const isFirst = tree === firstTree(data.items, world);
  return (
    <Fold id={`holds|${tree}`} title={`${word}${treeName ? ` (${treeName})` : ""} (${children.length})`}>
      {editing && canHold && (
        <>
          <label className="stack">
            <select value="" onChange={(e) => e.target.value && bringIn(e.target.value)}>
              <option value="">Move an item in here…</option>
              {movable.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </label>
          {isFirst && (
            <Fold id="add-inside" title="Add an item inside">
              <NewPlace data={data} world={world} save={save} inside={thing.key} onMade={() => undefined} />
            </Fold>
          )}
        </>
      )}
      {children.length > 0 && <p className="sub swipe-hint">Swipe one left to take it out of here.</p>}
      <ul className="list">
        {children.map((c) => (
          <li key={c.key}>
            <SwipeRow action="Take out" onAction={async () => await save(setParent(data.items, world, c.key, null, tree).items)}>
              <button onClick={() => nav.open({ name: "place", key: c.key })}>
                <span className="title">{iconOf(data.items, c)} {c.name}</span>
                {(c.summary || childrenOf(data.items, world, c.key, tree).length > 0) && (
                  <span className="sub">{[c.summary, childrenOf(data.items, world, c.key, tree).length ? `${childrenOf(data.items, world, c.key, tree).length} inside` : ""].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

// --- Groups (area things, world-structure §4): many at once, beside the one place it's in ----------

type GroupPart = { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void> };

// Several grouping link kinds: say which one each row is; one: no need.
function linkWord(data: AppData, world: string, m: Membership, backwards: boolean): string {
  if (groupLinkKinds(data.items, world).length < 2) return "";
  return `${backwards ? m.linkKind.reverseName ?? m.linkKind.name : m.linkKind.name} · `;
}

// The groups this place is in.
function InGroups({ data, nav, thing, editing, save }: GroupPart) {
  const world = thing.world;
  const kinds = groupLinkKinds(data.items, world);
  const groups = groupsOf(data.items, world, thing.key);
  const canJoin = kinds.length > 0 && !refusal(data.items, world, kinds[0].key, "from", thing.key);
  if (kinds.length === 0 || ((!editing || !canJoin) && groups.length === 0)) return null;
  const offered = [...groupsIn(data.items, world), ...thingsIn(data.items, world).filter((t) => !groupsIn(data.items, world).some((g) => g.key === t.key))]
    .filter((t) => t.key !== thing.key && !groups.some((g) => g.thing.key === t.key) && !refusal(data.items, world, kinds[0].key, "to", t.key));
  const join = async (group: string) => {
    const result = addToGroup(data.items, world, thing.key, kinds[0].key, group);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  return (
    <Fold id="groups" title={`Groups (${groups.length})`}>
      {editing && (
        <label className="stack">
          <select value="" onChange={(e) => e.target.value && join(e.target.value)}>
            <option value="">Put it in a group…</option>
            {offered.map((t) => <option key={t.key} value={t.key}>{t.name}{groupsIn(data.items, world).some((g) => g.key === t.key) ? "" : " (makes it a group)"}</option>)}
          </select>
        </label>
      )}
      <ul className="list">
        {groups.map((g) => (
          <li key={g.link.key}>
            <SwipeRow action="Leave" onAction={() => save(removeFromGroup(data.items, world, thing.key, g.linkKind.key, g.thing.key))}>
              <button onClick={() => nav.open({ name: "place", key: g.thing.key })}>
                <span className="title">{linkWord(data, world, g, false)}{iconOf(data.items, g.thing)} {g.thing.name}</span>
                {g.thing.summary && <span className="sub">{g.thing.summary}</span>}
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

// What's in this place as a group.
function Members({ data, nav, thing, editing, save }: GroupPart) {
  const world = thing.world;
  const kinds = groupLinkKinds(data.items, world);
  const members = membersOf(data.items, world, thing.key);
  const canGroup = kinds.length > 0 && !refusal(data.items, world, kinds[0].key, "to", thing.key);
  if (kinds.length === 0 || ((!editing || !canGroup) && members.length === 0)) return null;
  const offered = thingsIn(data.items, world)
    .filter((t) => t.key !== thing.key && !members.some((m) => m.thing.key === t.key) && !refusal(data.items, world, kinds[0].key, "from", t.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  const add = async (member: string) => {
    const result = addToGroup(data.items, world, member, kinds[0].key, thing.key);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const heading = kinds[0].reverseName ? `${kinds[0].reverseName[0].toUpperCase()}${kinds[0].reverseName.slice(1)}` : "Members";
  return (
    <Fold id="covers" title={`${heading} (${members.length})`}>
      {editing && (
        <label className="stack">
          <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
            <option value="">Add an item to this group…</option>
            {offered.map((t) => <option key={t.key} value={t.key}>{pathOf(data.items, world, t.key).map((p) => p.name).join(" › ")}</option>)}
          </select>
        </label>
      )}
      {editing && members.length === 0 && <p className="sub">Add items to make this a group: they stay where they are, and can be in other groups too.</p>}
      <ul className="list">
        {members.map((m) => (
          <li key={m.link.key}>
            <SwipeRow action="Take out" onAction={() => save(removeFromGroup(data.items, world, m.thing.key, m.linkKind.key, thing.key))}>
              <button onClick={() => nav.open({ name: "place", key: m.thing.key })}>
                <span className="title">{linkWord(data, world, m, true)}{iconOf(data.items, m.thing)} {m.thing.name}</span>
                <span className="sub">{pathOf(data.items, world, m.thing.key).slice(0, -1).map((t) => t.name).join(" › ")}</span>
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

// Its links (owner, 26 Nov): first where it sits in each tree, in the world's order, each step
// opening ("in: The Empire › Wissenland", "in (terrain): Kleindorf"); then every other link read from
// this end ("in" one way, "holds" the other). Groups are their own section.
function AllLinks({ data, nav, thing }: { data: AppData; nav: Nav; thing: Thing }) {
  const world = thing.world;
  const kinds = new Map(linkKindsIn(data.items, world).map((k) => [k.key, k]));
  const names = new Map(thingsIn(data.items, world).map((t) => [t.key, t.name]));
  const hierarchical = new Set(linkKindsIn(data.items, world).filter((k) => k.hierarchy !== "none").map((k) => k.key));
  const chains = treeKinds(data.items, world)
    .map((k) => ({ kind: k, path: pathOf(data.items, world, thing.key, k.key).slice(0, -1) }))
    .filter((c) => c.path.length > 0);
  const rows = linksIn(data.items, world)
    .filter((l) => !hierarchical.has(l.linkKind) && (l.from === thing.key || l.to === thing.key))
    .map((l) => {
      const kind = kinds.get(l.linkKind);
      const outward = l.from === thing.key;
      const word = outward || kind?.direction === "both ways" ? kind?.name ?? l.linkKind : kind?.reverseName ?? `(${kind?.name ?? l.linkKind}) from`;
      return { key: l.key, word, other: outward ? l.to : l.from, value: l.value };
    });
  if (chains.length === 0 && rows.length === 0) return null;
  return (
    <Fold id="links" title="Links">
      <ul className="plain links">
        {chains.map((c) => (
          <li key={c.kind.key}>
            <span className="link-word">{c.kind.name}:</span>{" "}
            {c.path.map((t, n) => (
              <span key={t.key}>
                {n > 0 && " › "}
                <button className="link" onClick={() => nav.open({ name: "place", key: t.key })}>{t.name}</button>
              </span>
            ))}
          </li>
        ))}
        {rows.map((r) => (
          <li key={r.key}>
            <span className="link-word">{r.word}:</span> <button className="link" onClick={() => nav.open({ name: "place", key: r.other })}>{names.get(r.other) ?? r.other}</button>
            {r.value && <span className="sub"> · {r.value}</span>}
          </li>
        ))}
      </ul>
    </Fold>
  );
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
