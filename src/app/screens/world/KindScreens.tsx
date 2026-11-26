// World → Kinds → one kind of thing, or one kind of link: edited in the app (owner: "all
// configuration in the app"). Design: design/world-structure.md §2 (kinds are world content; their
// fields are offered, not exclusive; several kinds per thing), §3 (each link kind declared once:
// direction, hierarchy, what it expects at each end; the app warns, never blocks).
import { useState } from "react";
import type { Item, LinkKind, ThingKind } from "../../../items/items";
import { linksIn, removeThingKind, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { cloneLinkKind, fieldsOffered, flavoursOf, hasKind, kindTree, removeLinkKind, setFlavourOf } from "../../../world/kinds";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { TextBox } from "./text-box";

export function ThingKindScreen({ data, nav, kindKey }: { data: AppData; nav: Nav; kindKey: string }) {
  const [, setChanged] = useState(0);
  const [field, setField] = useState("");
  const kind = data.items.find((i): i is ThingKind => i.kind === "thing-kind" && i.key === kindKey);
  if (!kind) return <p className="hint">This kind isn't in the world any more.</p>;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));
  const change = (patch: Partial<ThingKind>) => save(data.items.map((i) => (i.key === kind.key ? ({ ...kind, ...patch } as ThingKind) : i)));
  const used = thingsIn(data.items, kind.world).filter((t) => hasKind(data.items, kind.world, t.kinds, kind.key));
  const inherited = fieldsOffered(data.items, kind.world, kind.key).filter((f) => f.inherited);
  const allFlavours = flavoursOf(data.items, kind.world, kind.key);
  const flavours = allFlavours.filter((f) => f.flavourOf === kind.key);
  const below = new Set(flavoursOf(data.items, kind.world, kind.key).map((k) => k.key));
  const parentChoices = kindTree(data.items, kind.world).filter(({ kind: k }) => k.key !== kind.key && !below.has(k.key));
  const nameOf = (key: string) => thingKindsIn(data.items, kind.world).find((k) => k.key === key)?.name ?? key;
  const setParentKind = async (to: string) => {
    const result = setFlavourOf(data.items, kind.world, kind.key, to || null);
    if (result.problem) return alert(result.problem);
    await save(result.items);
  };
  const moveField = (n: number, by: number) => {
    const fields = [...kind.fields];
    const [f] = fields.splice(n, 1);
    fields.splice(n + by, 0, f);
    change({ fields });
  };

  return (
    <article className="card">
      <div className="place-head">
        <TextBox className="icon-box" value={kind.icon ?? ""} placeholder="•" onSave={(v) => change({ icon: v || undefined })} />
        <div className="place-title"><TextBox className="name-box" value={kind.name} onSave={(v) => v && change({ name: v })} /></div>
      </div>
      <TextBox className="filter" value={kind.about ?? ""} placeholder="What it is (one line)" onSave={(v) => change({ about: v || undefined })} />
      <label className="stack">
        <span className="sub">Flavour of</span>
        <select value={kind.flavourOf ?? ""} onChange={(e) => setParentKind(e.target.value)}>
          <option value="">(nothing: a kind of its own)</option>
          {parentChoices.map(({ kind: k, depth }) => <option key={k.key} value={k.key}>{"  ".repeat(depth)}{k.name}</option>)}
        </select>
      </label>
      {flavours.length > 0 && (
        <p className="sub">Its flavours: {flavours.map((f, n) => <span key={f.key}>{n > 0 && ", "}<button className="link" onClick={() => nav.open({ name: "thing-kind", key: f.key })}>{f.name}</button></span>)}</p>
      )}
      <h2>Fields offered</h2>
      {inherited.map((f) => (
        <div className="field kind-field inherited" key={`${f.of}|${f.field.name}`}>
          <span className="label">{f.field.name}</span>
          <span className="sub">from {nameOf(f.of)}</span>
        </div>
      ))}
      <p className="sub">Every {kind.name.toLowerCase()} is offered these; any item can still have fields of its own.</p>
      {kind.fields.map((f, n) => (
        <div className="field kind-field" key={`${f.name}-${n}`}>
          <TextBox className="field-box" value={f.name} onSave={(v) => v && change({ fields: kind.fields.map((g, j) => (j === n ? { ...g, name: v } : g)) })} />
          <TextBox className="field-box" value={f.about ?? ""} placeholder="hint" onSave={(v) => change({ fields: kind.fields.map((g, j) => (j === n ? { name: g.name, ...(v ? { about: v } : {}) } : g)) })} />
          <span className="row-buttons">
            <button className="link" disabled={n === 0} onClick={() => moveField(n, -1)} aria-label="Up">↑</button>
            <button className="link" disabled={n === kind.fields.length - 1} onClick={() => moveField(n, 1)} aria-label="Down">↓</button>
            <button className="link remove-x" onClick={() => change({ fields: kind.fields.filter((_, j) => j !== n) })} aria-label="Remove">✕</button>
          </span>
        </div>
      ))}
      <div className="inline-add">
        <input className="filter" placeholder="New field (e.g. population)" value={field} onChange={(e) => setField(e.target.value)} onKeyDown={(e) => e.key === "Enter" && field.trim() && (change({ fields: [...kind.fields, { name: field.trim() }] }), setField(""))} />
        <button disabled={!field.trim()} onClick={() => (change({ fields: [...kind.fields, { name: field.trim() }] }), setField(""))}>Add</button>
      </div>
      <h2>Items of this kind ({used.length})</h2>
      {/* Split: this kind itself, then each flavour (any depth), each folding (owner, 26 Nov). */}
      {[{ key: kind.key, name: `${kind.name} itself`, list: used.filter((t) => t.kinds.includes(kind.key)) }, ...allFlavours.map((f) => ({ key: f.key, name: f.name, list: used.filter((t) => t.kinds.includes(f.key) && !t.kinds.includes(kind.key)) }))]
        .filter((g) => g.list.length > 0 || g.key === kind.key)
        .map((g) => (
          <details key={g.key} className="fold" open={g.key === kind.key}>
            <summary>{g.name} ({g.list.length})</summary>
            <ul className="plain">
              {g.list.map((t) => <li key={t.key}><button className="link" onClick={() => nav.open({ name: "place", key: t.key })}>{t.name}</button></li>)}
            </ul>
          </details>
        ))}
      <div className="buttons">
        <button className="danger" onClick={async () => {
          if (!confirm(`Remove the kind ${kind.name}?${used.length ? ` ${used.length} item${used.length > 1 ? "s" : ""} lose it; their fields stay as their own.` : ""}`)) return;
          await data.setItems(removeThingKind(data.items, kind.key));
          nav.back();
        }}>Remove this kind</button>
      </div>
    </article>
  );
}

export function LinkKindScreen({ data, nav, kindKey }: { data: AppData; nav: Nav; kindKey: string }) {
  const [, setChanged] = useState(0);
  const kind = data.items.find((i): i is LinkKind => i.kind === "link-kind" && i.key === kindKey);
  if (!kind) return <p className="hint">This link kind isn't in the world any more.</p>;
  const change = async (patch: Partial<LinkKind>) => (await data.setItems(data.items.map((i) => (i.key === kind.key ? ({ ...kind, ...patch } as LinkKind) : i))), setChanged((n) => n + 1));
  const thingKinds = kindTree(data.items, kind.world); // flavours after their kind
  const count = linksIn(data.items, kind.world).filter((l) => l.linkKind === kind.key).length;
  const isTree = worldOf(data.items, kind.world)?.tree === kind.key;
  const strict = (kind.strictness ?? "strict") === "strict";
  const toggle = (list: string[] | undefined, key: string) => {
    const now = list ?? [];
    const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
    return next.length ? next : undefined;
  };

  return (
    <article className="card">
      <TextBox className="name-box" value={kind.name} onSave={(v) => v && change({ name: v })} />
      <TextBox className="filter" value={kind.about ?? ""} placeholder="What it means (one line)" onSave={(v) => change({ about: v || undefined })} />
      <div className="field">
        <span className="label">Read backwards</span>
        <TextBox className="field-box" value={kind.reverseName ?? ""} placeholder={`e.g. "holds" for "in"`} onSave={(v) => change({ reverseName: v || undefined })} />
      </div>
      <div className="field">
        <span className="label">Direction</span>
        <select value={kind.direction} onChange={(e) => change({ direction: e.target.value as LinkKind["direction"] })}>
          <option value="one-way">one way (serves, in)</option>
          <option value="both ways">both ways (allied, feud)</option>
        </select>
      </div>
      <div className="field">
        <span className="label">Hierarchy</span>
        <select value={kind.hierarchy} onChange={(e) => change({ hierarchy: e.target.value as LinkKind["hierarchy"] })} disabled={isTree}>
          <option value="none">none</option>
          <option value="one parent">one parent at a time (a tree)</option>
          <option value="several parents">several parents, no loops</option>
        </select>
      </div>
      {isTree && <p className="sub">This is the world's main tree, so it stays one parent at a time.</p>}
      <h2>What this does here</h2>
      <ul className="plain does">{whatItDoes(kind, isTree).map((line) => <li key={line}>{line}</li>)}</ul>
      <h2>What it takes</h2>
      <nav className="segments small">
        <button className={strict ? "on" : ""} onClick={() => change({ strictness: undefined })}>Strict</button>
        <button className={!strict ? "on" : ""} onClick={() => change({ strictness: "warn" })}>Warn only</button>
      </nav>
      <p className="sub">
        {strict ? "Strict: an item that doesn't fit isn't offered and can't be put in." : "Warn only: anything can be put in; what doesn't fit is flagged on the Items tab."} A kind's flavours count too, even ones added later; the nearest kind decides, so a flavour can be put back after its kind is left out.
      </p>
      <KindChips label="Takes (both ends)" hint="Nothing ticked: every kind not left out." kinds={thingKinds} on={kind.scope} onToggle={(k) => change({ scope: toggle(kind.scope, k) })} />
      <KindChips label="Leaves out (both ends)" hint="Their flavours too, unless ticked under Takes." kinds={thingKinds} on={kind.exclude} onToggle={(k) => change({ exclude: toggle(kind.exclude, k) })} />
      <details className="fold" open={Boolean(kind.expectsFrom?.length || kind.expectsTo?.length)}>
        <summary>The two ends differ</summary>
        <p className="sub">An end with kinds ticked here uses them instead of Takes.</p>
        <KindChips label={kind.hierarchy === "none" ? "From" : "Inside"} kinds={thingKinds} on={kind.expectsFrom} onToggle={(k) => change({ expectsFrom: toggle(kind.expectsFrom, k) })} />
        <KindChips label={kind.hierarchy === "none" ? "To" : "Container"} kinds={thingKinds} on={kind.expectsTo} onToggle={(k) => change({ expectsTo: toggle(kind.expectsTo, k) })} />
      </details>
      <p className="sub">{count} link{count === 1 ? "" : "s"} of this kind.</p>
      <div className="buttons">
        <button onClick={async () => {
          const name = prompt("Name for the copy (its settings, not its links):", `${kind.name} (copy)`);
          if (!name) return;
          const result = cloneLinkKind(data.items, kind.world, kind.key, name);
          if (result.problem) return alert(result.problem);
          await data.setItems(result.items);
          nav.open({ name: "link-kind", key: result.key! });
        }}>Copy as a new link kind</button>
        <button className="danger" onClick={async () => {
          if (!confirm(`Remove the link kind ${kind.name}?${count ? ` Its ${count} link${count === 1 ? "" : "s"} go too.` : ""}${isTree ? " It's the main tree: the world will have none until you choose one." : ""}`)) return;
          await data.setItems(removeLinkKind(data.items, kind.world, kind.key));
          nav.back();
        }}>Remove this link kind</button>
      </div>
    </article>
  );
}

// A row of kinds to tick, flavours indented after their kind.
function KindChips({ label, hint, kinds, on, onToggle }: { label: string; hint?: string; kinds: { kind: ThingKind; depth: number }[]; on: string[] | undefined; onToggle: (key: string) => void }) {
  return (
    <div className="kind-chips">
      <div className="sub">{label}{hint ? ` · ${hint}` : ""}</div>
      <div className="chips">
        {kinds.map(({ kind: k, depth }) => (
          <button key={k.key} className={on?.includes(k.key) ? "on" : ""} onClick={() => onToggle(k.key)}>{depth > 0 ? "↳ " : ""}{k.icon} {k.name}</button>
        ))}
      </div>
    </div>
  );
}

// What a link kind's settings do in the app today, in plain words (owner, 25 Nov: "where do I see
// the functions available"). Kept beside the settings so it changes with them.
function whatItDoes(kind: LinkKind, isMain: boolean): string[] {
  const lines: string[] = [];
  if (kind.hierarchy === "one parent") {
    lines.push("A tree: an item is in at most one at a time, so containers of this kind don't overlap.");
    lines.push("Shown under Items → Tree and in the Diagram (choose the tree there), as a line on each item's page, and as areas on maps (Areas ▾ → Tree).");
    if (isMain) lines.push("The main tree: the trail under an item's name and the new-item form follow it.");
  } else if (kind.hierarchy === "several parents") {
    lines.push("Groups: an item can be in many at once, and groups can overlap.");
    lines.push("Shown under Items → Groups, as Groups and members on each item's page, and as dashed areas on maps.");
  } else {
    lines.push("A connection: it joins two items and contains nothing (a road, an alliance).");
    lines.push("Drawing connections comes next: until then links of this kind are listed under Links on an item's page.");
  }
  lines.push(kind.direction === "both ways" ? "Both ways: it reads the same from either end." : `One way: from the other end it reads "${kind.reverseName ?? `${kind.name} (from)`}".`);
  lines.push(kind.strictness === "warn" ? "What it takes (below) is a warning: misfits are allowed and flagged." : "What it takes (below) is enforced: misfits are refused.");
  return lines;
}
