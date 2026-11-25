// World → a place: its entry, read like a wiki page, edited in place.
// Design: design/world-structure.md §1 (a thing with attributes; contents), §2 (several kinds; a
// kind's fields offered, not exclusive; fields named per kind), §3 (links, read from both ends),
// §4 (containment), §5 (the maps it's pinned on), §10 (a list of names).
// The form is worked out from the place's kinds (one definition drives every surface,
// authoring-v2 §5.2); it will join the shared form when Lists' editor brings one.
import { useState } from "react";
import type { Item, Thing, ThingField, ThingName } from "../../../items/items";
import { linkKindsIn, linksIn, mapsIn, removeThing, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { childrenOf, descendantsOf, pathOf, setParent } from "../../../world/places";
import { iconOf, mapsShowing } from "../../../world/maps";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NewPlace } from "./WorldScreen";
import { TextBox } from "./text-box";

export function PlaceScreen({ data, nav, thingKey }: { data: AppData; nav: Nav; thingKey: string }) {
  const [editing, setEditing] = useState(false);
  const [, setChanged] = useState(0);
  const thing = data.items.find((i): i is Thing => i.kind === "thing" && i.key === thingKey);
  if (!thing) return <p className="hint">This place isn't in the world any more.</p>;
  const world = thing.world;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));
  const change = (patch: Partial<Thing>) => save(data.items.map((i) => (i.key === thing.key ? ({ ...thing, ...patch } as Thing) : i)));
  const path = pathOf(data.items, world, thing.key).slice(0, -1);

  return (
    <article className="card place">
      <div className="place-head">
        {editing ? (
          <TextBox className="icon-box" value={thing.icon ?? ""} placeholder={iconOf(data.items, thing)} onSave={(v) => change({ icon: v || undefined })} />
        ) : (
          <span className="place-icon">{iconOf(data.items, thing)}</span>
        )}
        <div className="place-title">
          {editing ? <TextBox className="name-box" value={thing.name} onSave={(v) => v && change({ name: v })} /> : <h1>{thing.name}</h1>}
          <Breadcrumb nav={nav} path={path} />
        </div>
        <button className="link edit-toggle" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
      </div>

      <Kinds data={data} thing={thing} editing={editing} change={change} />
      {editing && <Parent data={data} thing={thing} save={save} />}

      {editing ? (
        <>
          <TextBox className="filter" value={thing.summary ?? ""} placeholder="One line: what it is" onSave={(v) => change({ summary: v || undefined })} />
          <TextBox multiline className="description-box" value={thing.description ?? ""} placeholder="Its entry: history, look, people, rumours…" onSave={(v) => change({ description: v || undefined })} />
        </>
      ) : (
        <>
          {thing.summary && <p className="summary">{thing.summary}</p>}
          {thing.description && <div className="description">{thing.description}</div>}
          {!thing.summary && !thing.description && <p className="sub">No entry yet: Edit to write one.</p>}
        </>
      )}

      <Fields data={data} thing={thing} editing={editing} change={change} />
      <OtherNames thing={thing} editing={editing} change={change} />
      <Contents data={data} nav={nav} thing={thing} editing={editing} save={save} />
      <OtherLinks data={data} nav={nav} thing={thing} />
      <OnMaps data={data} nav={nav} thing={thing} />

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
      {(editing || thing.notes) && (
        <section>
          <h2>Notes</h2>
          {editing ? (
            <TextBox multiline className="description-box" value={thing.notes ?? ""} placeholder="Your own notes" onSave={(v) => change({ notes: v || undefined })} />
          ) : (
            <div className="description">{thing.notes}</div>
          )}
        </section>
      )}

      {editing && (
        <div className="buttons">
          <button className="danger" onClick={async () => {
            const held = childrenOf(data.items, world, thing.key).length;
            if (!confirm(`Remove ${thing.name}?${held ? ` The ${held} place${held > 1 ? "s" : ""} inside it move to the top.` : ""}`)) return;
            await data.setItems(removeThing(data.items, thing.key));
            nav.back();
          }}>Remove {thing.name}</button>
        </div>
      )}
    </article>
  );
}

function Breadcrumb({ nav, path }: { nav: Nav; path: Thing[] }) {
  if (path.length === 0) return null;
  return (
    <div className="breadcrumb">
      in{" "}
      {path.map((t, n) => (
        <span key={t.key}>
          {n > 0 && " › "}
          <button className="link" onClick={() => nav.open({ name: "place", key: t.key })}>{t.name}</button>
        </span>
      ))}
    </div>
  );
}

// Kinds as chips; editing, every kind of the world to switch on or off.
function Kinds({ data, thing, editing, change }: { data: AppData; thing: Thing; editing: boolean; change: (p: Partial<Thing>) => void }) {
  const kinds = thingKindsIn(data.items, thing.world);
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

// Where it is: any place but itself and what it holds.
function Parent({ data, thing, save }: { data: AppData; thing: Thing; save: (items: Item[]) => Promise<void> }) {
  const world = worldOf(data.items, thing.world);
  if (!world?.tree) return <p className="sub">This world has no link kind grouping places (World → Kinds).</p>;
  const current = pathOf(data.items, thing.world, thing.key).slice(-2, -1)[0]?.key ?? "";
  const inside = new Set(descendantsOf(data.items, thing.world, thing.key).map((t) => t.key));
  const choices = thingsIn(data.items, thing.world).filter((t) => t.key !== thing.key && !inside.has(t.key));
  const label = (t: Thing) => pathOf(data.items, thing.world, t.key).map((p) => p.name).join(" › ");
  const move = async (to: string) => {
    const result = setParent(data.items, thing.world, thing.key, to || null);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  return (
    <label className="stack">
      <span className="sub">In</span>
      <select value={current} onChange={(e) => move(e.target.value)}>
        <option value="">(the top)</option>
        {choices.map((t) => ({ t, label: label(t) })).sort((a, b) => a.label.localeCompare(b.label)).map(({ t, label }) => <option key={t.key} value={t.key}>{label}</option>)}
      </select>
    </label>
  );
}

// Fields, under each of its kinds (fields are named per kind), then its one-offs.
function Fields({ data, thing, editing, change }: { data: AppData; thing: Thing; editing: boolean; change: (p: Partial<Thing>) => void }) {
  const [newField, setNewField] = useState("");
  const kinds = thingKindsIn(data.items, thing.world).filter((k) => thing.kinds.includes(k.key));
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
    <section>
      <h2>Details</h2>
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
          <input className="filter" placeholder="Another field, just for this place" value={newField} onChange={(e) => setNewField(e.target.value)} />
          <button disabled={!newField.trim()} onClick={() => (setValue(undefined, newField.trim(), "?"), setNewField(""))}>Add</button>
        </div>
      )}
    </section>
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
    <section>
      <h2>Other names</h2>
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
          <input className="filter" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="row-fields">
            <input className="filter" placeholder="Kind (common, old…)" value={draft.nameKind ?? ""} onChange={(e) => setDraft({ ...draft, nameKind: e.target.value })} />
            <input className="filter" placeholder="Language" value={draft.language ?? ""} onChange={(e) => setDraft({ ...draft, language: e.target.value })} />
            <input className="filter" placeholder="Era" value={draft.era ?? ""} onChange={(e) => setDraft({ ...draft, era: e.target.value })} />
          </div>
          <button disabled={!draft.name.trim()} onClick={add}>Add name</button>
        </div>
      )}
    </section>
  );
}

// What it holds: open one; add a new place inside; or put an existing place in here.
function Contents({ data, nav, thing, editing, save }: { data: AppData; nav: Nav; thing: Thing; editing: boolean; save: (items: Item[]) => Promise<void> }) {
  const world = thing.world;
  const children = childrenOf(data.items, world, thing.key);
  const above = new Set(pathOf(data.items, world, thing.key).map((t) => t.key));
  const movable = thingsIn(data.items, world).filter((t) => !above.has(t.key) && !children.some((c) => c.key === t.key)).sort((a, b) => a.name.localeCompare(b.name));
  if (!editing && children.length === 0) return null;
  const bringIn = async (key: string) => {
    const result = setParent(data.items, world, key, thing.key);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const reverse = worldOf(data.items, world)?.tree ? linkKindsIn(data.items, world).find((k) => k.key === worldOf(data.items, world)!.tree)?.reverseName : undefined;
  return (
    <section>
      <h2>{reverse ? `${reverse[0].toUpperCase()}${reverse.slice(1)}` : "Contains"} ({children.length})</h2>
      <ul className="list">
        {children.map((c) => (
          <li key={c.key}>
            <button onClick={() => nav.open({ name: "place", key: c.key })}>
              <span className="title">{iconOf(data.items, c)} {c.name}</span>
              {(c.summary || childrenOf(data.items, world, c.key).length > 0) && (
                <span className="sub">{[c.summary, childrenOf(data.items, world, c.key).length ? `${childrenOf(data.items, world, c.key).length} inside` : ""].filter(Boolean).join(" · ")}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <>
          <label className="stack">
            <span className="sub">Move a place in here</span>
            <select value="" onChange={(e) => e.target.value && bringIn(e.target.value)}>
              <option value="">Choose…</option>
              {movable.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </label>
          <NewPlace data={data} world={world} save={save} inside={thing.key} onMade={() => undefined} />
        </>
      )}
    </section>
  );
}

// Every link but containment (shown above), read from this end: "in" one way, "holds" the other.
function OtherLinks({ data, nav, thing }: { data: AppData; nav: Nav; thing: Thing }) {
  const world = worldOf(data.items, thing.world);
  const kinds = new Map(linkKindsIn(data.items, thing.world).map((k) => [k.key, k]));
  const names = new Map(thingsIn(data.items, thing.world).map((t) => [t.key, t.name]));
  const rows = linksIn(data.items, thing.world)
    .filter((l) => l.linkKind !== world?.tree && (l.from === thing.key || l.to === thing.key))
    .map((l) => {
      const kind = kinds.get(l.linkKind);
      const outward = l.from === thing.key;
      const word = outward || kind?.direction === "both ways" ? kind?.name ?? l.linkKind : kind?.reverseName ?? `(${kind?.name ?? l.linkKind}) from`;
      return { key: l.key, word, other: outward ? l.to : l.from, value: l.value };
    });
  if (rows.length === 0) return null;
  return (
    <section>
      <h2>Links</h2>
      <ul className="plain">
        {rows.map((r) => (
          <li key={r.key}>
            {r.word} <button className="link" onClick={() => nav.open({ name: "place", key: r.other })}>{names.get(r.other) ?? r.other}</button>
            {r.value && <span className="sub"> · {r.value}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The maps it's pinned on; or pin it on one.
function OnMaps({ data, nav, thing }: { data: AppData; nav: Nav; thing: Thing }) {
  const on = mapsShowing(data.items, thing.key);
  const others = mapsIn(data.items, thing.world).filter((m) => !on.some((o) => o.key === m.key));
  return (
    <section>
      <h2>On maps</h2>
      {on.length === 0 && <p className="sub">Not on any map yet.</p>}
      <ul className="plain">
        {on.map((m) => (
          <li key={m.key}><button className="link" onClick={() => nav.open({ name: "map", key: m.key, focus: thing.key })}>🗺️ {m.name}</button></li>
        ))}
      </ul>
      {others.length > 0 && (
        <label className="stack">
          <select value="" onChange={(e) => e.target.value && nav.open({ name: "map", key: e.target.value, place: thing.key })}>
            <option value="">Pin it on a map…</option>
            {others.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}

function splitList(text: string): string[] | undefined {
  const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}
