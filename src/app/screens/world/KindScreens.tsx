// World → Kinds → one kind of thing, or one kind of link: edited in the app (owner: "all
// configuration in the app"). Design: design/world-structure.md §2 (kinds are world content; their
// fields are offered, not exclusive; several kinds per thing), §3 (each link kind declared once:
// direction, hierarchy, what it expects at each end; the app warns, never blocks).
import { useState } from "react";
import type { Item, LinkKind, ThingKind } from "../../../items/items";
import { linksIn, removeThingKind, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { cloneLinkKind, fieldsOffered, flavoursOf, hasKind, kindTree, misfitLinks, removeLinkKind, setEndsDiffer, setFlavourOf } from "../../../world/kinds";
import { MisfitList } from "./WorldScreen";
import type { AppData } from "../../app-data";
import { firstTree } from "../../../world/places";
import { fieldSummary, linkKindStyle, linkTitle } from "../../../world/links";
import { SwipeRow } from "../../swipe";
import type { Nav } from "../../App";
import { ChoicesBox, TextBox } from "./text-box";
import { useFoldAll } from "./fold-all";

export function ThingKindScreen({ data, nav, kindKey }: { data: AppData; nav: Nav; kindKey: string }) {
  const [, setChanged] = useState(0);
  const [field, setField] = useState("");
  const folds = useFoldAll();
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
          <TextBox className="field-box" value={f.about ?? ""} placeholder="hint" onSave={(v) => change({ fields: kind.fields.map((g, j) => (j === n ? { ...g, about: v || undefined } : g)) })} />
          <ChoicesBox choices={f.choices} onSave={(choices) => change({ fields: kind.fields.map((g, j) => (j === n ? { ...g, choices } : g)) })} />
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
      <h2>Items of this kind ({used.length}) {folds.controls}</h2>
      {/* Split: this kind itself, then each flavour (any depth), each folding (owner, 26 Nov). */}
      {[{ key: kind.key, name: `${kind.name} itself`, list: used.filter((t) => t.kinds.includes(kind.key)) }, ...allFlavours.map((f) => ({ key: f.key, name: f.name, list: used.filter((t) => t.kinds.includes(f.key) && !t.kinds.includes(kind.key)) }))]
        .filter((g) => g.list.length > 0 || g.key === kind.key)
        .map((g) => (
          <details key={`${g.key}|${folds.epoch}`} className="fold" open={folds.openFor(g.key === kind.key)}>
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
  const isTree = firstTree(data.items, kind.world) === kind.key; // first in the order: shown first
  const strict = (kind.strictness ?? "strict") === "strict";
  const replace = async (next: LinkKind) => (await data.setItems(data.items.map((i) => (i.key === kind.key ? next : i))), setChanged((n) => n + 1));
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
        {/* Named by what it makes (owner, 27 Nov: "road" was set to several parents and became a group,
            not a line between two places). */}
        <span className="label">Makes</span>
        <select value={kind.hierarchy} onChange={(e) => change({ hierarchy: e.target.value as LinkKind["hierarchy"] })}>
          <option value="none">connections: a line between two items (a road, an alliance)</option>
          <option value="one parent">a tree: one container at a time (in, part of)</option>
          <option value="several parents">groups: many at once, no loops (in area, member of)</option>
        </select>
      </div>
      {/* What its links carry, and how they're drawn (owner, 27 Nov: configurable on the link kind,
          and on each link). */}
      <LinkFields kind={kind} change={change} />
      {kind.hierarchy === "none" && (
        // What its links can be stretches of (owner, 27 Nov: road links only part of Road items).
        <KindChips label="Its links can be part of" hint="Nothing ticked: any item. Strict or Warn only, as below." kinds={thingKinds} on={kind.partOfTakes} onToggle={(k) => change({ partOfTakes: toggle(kind.partOfTakes, k) })} />
      )}
      {kind.hierarchy === "none" ? (
        <DrawnAs data={data} kind={kind} change={change} />
      ) : (
        <>
          <h2>How its links are drawn</h2>
          <p className="sub">
            {kind.hierarchy === "one parent" ? "As a tree: areas on maps, branches on the Diagram." : "As groups: dashed areas on maps, outlines on the Diagram."} Only connections are drawn as lines (with a colour, line and arrows set here). For a road or an alliance, choose <b>Makes: connections</b> above: its links stay, and become connections.
          </p>
        </>
      )}
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
      {/* One list for both ends, or one per end: never both (owner, 26 Nov). */}
      <nav className="segments small">
        <button className={!kind.endsDiffer ? "on" : ""} onClick={() => replace(setEndsDiffer(kind, false))}>Same at both ends</button>
        <button className={kind.endsDiffer ? "on" : ""} onClick={() => replace(setEndsDiffer(kind, true))}>Ends differ</button>
      </nav>
      {kind.endsDiffer ? (
        <>
          <KindChips label={kind.hierarchy === "none" ? "From takes" : "Inside takes"} hint="Nothing ticked: every kind not left out." kinds={thingKinds} on={kind.expectsFrom} onToggle={(k) => change({ expectsFrom: toggle(kind.expectsFrom, k) })} />
          <KindChips label={kind.hierarchy === "none" ? "To takes" : "Container takes"} hint="Nothing ticked: every kind not left out." kinds={thingKinds} on={kind.expectsTo} onToggle={(k) => change({ expectsTo: toggle(kind.expectsTo, k) })} />
        </>
      ) : (
        <KindChips label="Takes" hint="Nothing ticked: every kind not left out." kinds={thingKinds} on={kind.scope} onToggle={(k) => change({ scope: toggle(kind.scope, k) })} />
      )}
      <KindChips label="Leaves out (both ends)" hint="Their flavours too, unless ticked to take." kinds={thingKinds} on={kind.exclude} onToggle={(k) => change({ exclude: toggle(kind.exclude, k) })} />
      {kind.hierarchy !== "several parents" && (
        <>
          <h2>Loose items in this {kind.hierarchy === "none" ? "network" : "tree"}</h2>
          <p className="sub">
            {kind.hierarchy === "none"
              ? "Items that fit this link kind but are on none of its links: shown after the network on the Diagram (choose it under Show), or not."
              : "Items that fit this tree but sit loose in it (nothing above, nothing inside): shown at the top of the tree, or not: a dynasty of rulers without everyone else."}
          </p>
          <nav className="segments small">
            <button className={kind.loose !== "hide" ? "on" : ""} onClick={() => change({ loose: undefined })}>Show</button>
            <button className={kind.loose === "hide" ? "on" : ""} onClick={() => change({ loose: "hide" })}>Hide</button>
          </nav>
          {(kind.hiddenHere ?? []).length > 0 && (
            <>
              <p className="sub">Hidden here by hand (swipe on Items, or select on the Diagram):</p>
              <ul className="plain">
                {(kind.hiddenHere ?? []).map((k) => (
                  <li key={k}>{thingsIn(data.items, kind.world).find((t) => t.key === k)?.name ?? k} · <button className="link" onClick={() => replace({ ...kind, hiddenHere: kind.hiddenHere!.filter((h) => h !== k).length ? kind.hiddenHere!.filter((h) => h !== k) : undefined })}>Show again</button></li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="sub">{count} link{count === 1 ? "" : "s"} of this kind.</p>
      {count > 0 && (
        <ul className="list">
          {linksIn(data.items, kind.world).filter((l) => l.linkKind === kind.key).map((l) => (
            <li key={l.key}>
              <button onClick={() => nav.open({ name: "link", key: l.key })}>
                <span className="title">{linkTitle(data.items, l)}</span>
                {(l.fields?.length || l.start || l.end) && <span className="sub">{[fieldSummary(data.items, l), [l.start, l.end].filter(Boolean).join("–")].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Links that no longer fit, after a change to what it takes: flagged, strict or warn. */}
      <MisfitList data={data} nav={nav} misfits={misfitLinks(data.items, kind.world).filter((m) => m.link.linkKind === kind.key)} save={async (items) => (await data.setItems(items), setChanged((n) => n + 1))} />
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
          if (!confirm(`Remove the link kind ${kind.name}?${count ? ` Its ${count} link${count === 1 ? "" : "s"} go too.` : ""}${isTree ? " It's the first tree in the order: the next one takes its place." : ""}`)) return;
          await data.setItems(removeLinkKind(data.items, kind.world, kind.key));
          nav.back();
        }}>Remove this link kind</button>
      </div>
    </article>
  );
}

// The fields its links carry (owner, 27 Nov: "links may carry multiple values … asymmetrical"): each
// the same both ways (distance) or kept each way (speed: uphill and down). Swipe one left to remove
// it from the kind; values already on links stay, as fields of their own.
function LinkFields({ kind, change }: { kind: LinkKind; change: (patch: Partial<LinkKind>) => Promise<void> }) {
  const [name, setName] = useState("");
  const fields = kind.fields ?? [];
  const set = (next: LinkKind["fields"]) => change({ fields: next && next.length ? next : undefined });
  const add = () => {
    const n = name.trim();
    if (!n || fields.some((f) => f.name.toLowerCase() === n.toLowerCase())) return;
    set([...fields, { name: n }]);
    setName("");
  };
  return (
    <>
      <h2>What its links carry</h2>
      {fields.length === 0 && <p className="sub">Nothing yet. Add a field (distance, loyalty, toll); tick "each way" for one that differs by direction (speed uphill and down).</p>}
      <ul className="list">
        {fields.map((f, n) => (
          <li key={f.name}>
            <SwipeRow action="Remove" onAction={() => set(fields.filter((_, i) => i !== n))}>
              <div className="link-field-row">
                <span className="title">{f.name}</span>
                <ChoicesBox choices={f.choices} onSave={(choices) => set(fields.map((g, i) => (i === n ? { ...g, choices } : g)))} />
                <label className="choice"><input type="checkbox" checked={!!f.byDirection} onChange={() => set(fields.map((g, i) => (i === n ? { ...g, byDirection: g.byDirection ? undefined : true } : g)))} /> each way</label>
              </div>
            </SwipeRow>
          </li>
        ))}
      </ul>
      <div className="inline-add">
        <input className="filter" placeholder="A field (e.g. distance)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add}>Add</button>
      </div>
    </>
  );
}

// How links of this kind are drawn on maps and the Diagram: colour, line, arrows (one way). A link can
// override the colour and line on its own card.
function DrawnAs({ data, kind, change }: { data: AppData; kind: LinkKind; change: (patch: Partial<LinkKind>) => Promise<void> }) {
  const style = linkKindStyle(data.items, kind.world, kind);
  return (
    <>
      <h2>How its links are drawn</h2>
      <label className="colour-row">
        <span className="sub">Colour</span>
        <input type="color" value={style.colour} onChange={(e) => change({ colour: e.target.value })} />
        {kind.colour && <button className="link" onClick={() => change({ colour: undefined })}>Use the default</button>}
      </label>
      <div className="field">
        <span className="label">Line</span>
        <select value={kind.line ?? "solid"} onChange={(e) => change({ line: e.target.value === "solid" ? undefined : (e.target.value as LinkKind["line"]) })}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      {kind.direction === "one-way" && (
        <label className="choice"><input type="checkbox" checked={kind.arrows !== false} onChange={() => change({ arrows: kind.arrows === false ? undefined : false })} /> An arrow on each link, pointing from → to</label>
      )}
    </>
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
    lines.push("Shown under Items → Tree and in the Diagram (choose the tree there), as a line on each item's page, and as areas on maps (Layers ▾ → the tree).");
    if (isMain) lines.push("First in the order (Kinds tab, ↑ ↓): shown first, and used wherever no tree is chosen.");
  } else if (kind.hierarchy === "several parents") {
    lines.push("Groups: an item can be in many at once, and groups can overlap.");
    lines.push("Shown under Items → Groups, as Groups and members on each item's page, and as dashed areas on maps.");
  } else {
    lines.push("A connection: it joins two items and contains nothing (a road, an alliance).");
    lines.push("Join two items with it from the map or the Diagram (select two, Join…) or an item's card (Connections). Its links are drawn on both, switched under Layers ▾ → Links, and listed under Connections on each item's page.");
  }
  if (kind.fields?.length) lines.push(`Each link carries ${kind.fields.map((f) => (f.byDirection ? `${f.name} (each way)` : f.name)).join(", ")}, filled in on the link's card.`);
  lines.push(kind.direction === "both ways" ? "Both ways: it reads the same from either end." : `One way: from the other end it reads "${kind.reverseName ?? `${kind.name} (from)`}".`);
  lines.push(kind.strictness === "warn" ? "What it takes (below) is a warning: misfits are allowed and flagged." : "What it takes (below) is enforced: misfits are refused.");
  return lines;
}
