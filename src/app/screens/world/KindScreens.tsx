// World → Kinds → one kind of thing, or one kind of link: edited in the app (owner: "all
// configuration in the app"). Design: design/world-structure.md §2 (kinds are world content; their
// fields are offered, not exclusive; several kinds per thing), §3 (each link kind declared once:
// direction, hierarchy, what it expects at each end; the app warns, never blocks).
import { useState } from "react";
import type { Item, LinkKind, ThingKind } from "../../../items/items";
import { linkKindsIn, linksIn, newKey, removeThingKind, thingKindsIn, thingsIn, worldOf } from "../../../world/world";
import { cloneLinkKind, fieldsOffered, flavoursOf, hasKind, kindTree, misfitLinks, removeLinkKind, setEndsDiffer, setFlavourOf } from "../../../world/kinds";
import { MisfitList } from "./WorldScreen";
import type { AppData } from "../../app-data";
import { firstTree, outOfScope } from "../../../world/places";
import { networkOutOfScope } from "../../../world/network";
import { containerKindsFor, fieldSummary, linkKindStyle, linkTitle } from "../../../world/links";
import { linkContainersIn } from "./link-lines";
import { SwipeRow } from "../../swipe";
import type { Nav } from "../../App";
import { ChoicesBox, TextBox } from "./text-box";
import { SELECTED_COLOUR } from "./selected-look";
import { useFoldAll } from "./fold-all";

// A kind being made is its own card from the start, held here and saved only once it has a name
// (owner, 28 Nov: "just have the button go straight to the card … don't create/save unless the name
// box is filled"). Saved, the card carries on as the kind's own.
function useKindCard<T extends ThingKind | LinkKind>(data: AppData, nav: Nav, kindKey: string | undefined, draft: T | undefined) {
  const [, setChanged] = useState(0);
  const [local, setLocal] = useState<T | undefined>(draft);
  const saved = kindKey ? (data.items.find((i) => i.key === kindKey) as T | undefined) : undefined;
  const kind = saved ?? local;
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));
  // Replaces the kind with `next`: kept here until it has a name, then saved and opened as itself.
  const replace = async (next: T) => {
    if (saved) return save(data.items.map((i) => (i.key === saved.key ? next : i)));
    if (!next.name.trim()) return setLocal(next);
    const key = newKey(data.items, next.world, next.kind, next.name);
    await data.setItems([...data.items, { ...next, key, name: next.name.trim() }]);
    nav.back();
    nav.open({ name: next.kind === "thing-kind" ? "thing-kind" : "link-kind", key });
  };
  const change = async (patch: Partial<T>): Promise<void> => {
    if (kind) await replace({ ...kind, ...patch } as T);
  };
  return { kind, isDraft: !saved, save, change, replace };
}

export function ThingKindScreen({ data, nav, kindKey, draft }: { data: AppData; nav: Nav; kindKey?: string; draft?: ThingKind }) {
  const [field, setField] = useState("");
  const folds = useFoldAll();
  const { kind, isDraft, save, change } = useKindCard(data, nav, kindKey, draft);
  if (!kind) return <p className="hint">This kind isn't in the world any more.</p>;
  const used = thingsIn(data.items, kind.world).filter((t) => hasKind(data.items, kind.world, t.kinds, kind.key));
  const inherited = fieldsOffered(data.items, kind.world, kind.key).filter((f) => f.inherited);
  const allFlavours = flavoursOf(data.items, kind.world, kind.key);
  const flavours = allFlavours.filter((f) => f.flavourOf === kind.key);
  const below = new Set(flavoursOf(data.items, kind.world, kind.key).map((k) => k.key));
  const parentChoices = kindTree(data.items, kind.world).filter(({ kind: k }) => k.key !== kind.key && !below.has(k.key));
  const nameOf = (key: string) => thingKindsIn(data.items, kind.world).find((k) => k.key === key)?.name ?? key;
  const setParentKind = async (to: string) => {
    if (isDraft) return change({ flavourOf: to || undefined });
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
      {isDraft && <p className="sub">A new kind of item: nothing is saved until it has a name.</p>}
      <div className="place-head">
        <TextBox className="icon-box" value={kind.icon ?? ""} placeholder="•" onSave={(v) => change({ icon: v || undefined })} />
        <div className="place-title"><TextBox className="name-box" value={kind.name} placeholder="Its name (e.g. City)" onSave={(v) => v && change({ name: v })} /></div>
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
          const only = used.filter((t) => t.kinds.length === 1 && t.kinds[0] === kind.key).length;
          if (only) return alert(`${only} item${only === 1 ? " has" : "s have"} no other kind than ${kind.name}: every item needs a kind, so give ${only === 1 ? "it" : "them"} another first.`);
          if (!confirm(`Remove the kind ${kind.name}?${used.length ? ` ${used.length} item${used.length > 1 ? "s" : ""} lose it; their fields stay as their own.` : ""}`)) return;
          await data.setItems(removeThingKind(data.items, kind.key));
          nav.back();
        }}>Remove this kind</button>
      </div>
    </article>
  );
}

export function LinkKindScreen({ data, nav, kindKey, draft }: { data: AppData; nav: Nav; kindKey?: string; draft?: LinkKind }) {
  const { kind, isDraft, save, change, replace } = useKindCard(data, nav, kindKey, draft);
  if (!kind) return <p className="hint">This kind isn't in the world any more.</p>;
  const thingKinds = kindTree(data.items, kind.world); // flavours after their kind
  const count = linksIn(data.items, kind.world).filter((l) => l.linkKind === kind.key).length;
  const isTree = firstTree(data.items, kind.world) === kind.key; // first in the order: shown first
  const strict = (kind.strictness ?? "strict") === "strict";
  const isConnection = kind.hierarchy === "none";
  const isLinkContainer = kind.hierarchy === "links";
  const connectionKinds = linkKindsIn(data.items, kind.world).filter((k) => k.hierarchy === "none");
  const toggle = (list: string[] | undefined, key: string) => {
    const now = list ?? [];
    const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
    return next.length ? next : undefined;
  };

  return (
    <article className="card">
      <TextBox className="name-box" value={kind.name} placeholder={`Its name (${kindExample(kind)})`} onSave={(v) => v && change({ name: v })} />
      {isDraft && <p className="sub">Nothing is saved until it has a name.</p>}
      <TextBox className="filter" value={kind.about ?? ""} placeholder="What it means (one line)" onSave={(v) => change({ about: v || undefined })} />
      <div className="field">
        <span className="label">Read backwards</span>
        <TextBox className="field-box" value={kind.reverseName ?? ""} placeholder={`e.g. "holds" for "in"`} onSave={(v) => change({ reverseName: v || undefined })} />
      </div>
      {/* Only a connection runs one way or both; containers are always one way (owner, 27 Nov). */}
      {isConnection && (
        <div className="field">
          <span className="label">Direction</span>
          <select value={kind.direction} onChange={(e) => change({ direction: e.target.value as LinkKind["direction"] })}>
            <option value="one-way">one way (serves, rules)</option>
            <option value="both ways">both ways (allied, feud)</option>
          </select>
        </div>
      )}
      {/* What it is, set when it was made (owner, 28 Nov: the switch was redundant). */}
      <p className="sub">{isConnection ? "A network type: its connectors join two items." : kind.hierarchy === "one parent" ? "A tree: one container at a time." : kind.hierarchy === "several parents" ? "A group: many at once, no loops." : "A link container: an item that holds connectors (a road made of its stretches, a border, a trade route)."}</p>
      {/* What its links carry, and how they're drawn (owner, 27 Nov): connections only. */}
      {isConnection && <LinkFields kind={kind} change={change} />}
      {isConnection ? (
        <DrawnAs data={data} kind={kind} change={change} />
      ) : (
        <>
          <h2>Diagram settings</h2>
          <p className="sub">
            {kind.hierarchy === "one parent" ? "Drawn as a tree: areas on maps, branches on the Diagram." : kind.hierarchy === "several parents" ? "Drawn as groups: dashed areas on maps, outlines on the Diagram." : "Drawn as a band under its connectors, with its name, on maps and the Diagram (Layers ▾ → Made of links)."}
          </p>
          {kind.hierarchy === "one parent" && <SelectedLook kind={kind} change={change} />}
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
      {/* A link container: the connections it holds, and the items that hold them (owner, 27 Nov: "uses
          the ends space to talk to the link types it can hold"). */}
      {isLinkContainer ? (
        <>
          <div className="kind-chips">
            <div className="sub">Holds these network types · Nothing ticked: any.</div>
            <div className="chips">
              {connectionKinds.map((k) => <button key={k.key} className={kind.expectsFrom?.includes(k.key) ? "on" : ""} onClick={() => change({ endsDiffer: true, expectsFrom: toggle(kind.expectsFrom, k.key) })}>{k.name}</button>)}
            </div>
          </div>
          <KindChips label="Held by these kinds of item" hint="Nothing ticked: any item not left out." kinds={thingKinds} on={kind.expectsTo} onToggle={(k) => change({ endsDiffer: true, expectsTo: toggle(kind.expectsTo, k) })} />
          <KindChips label="Leaves out" hint="Their flavours too, unless ticked to take." kinds={thingKinds} on={kind.exclude} onToggle={(k) => change({ exclude: toggle(kind.exclude, k) })} />
          <LinkContainersOf data={data} nav={nav} kind={kind} />
        </>
      ) : (
        <>
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
        </>
      )}
      {(kind.hierarchy === "one parent" || kind.hierarchy === "none") && !isDraft && (
        <>
          {/* Scope (owner, 28 Nov: "loose" is now "out of scope"). */}
          <h2>Scope</h2>
          <p className="sub">
            {kind.hierarchy === "none"
              ? `In scope: the items with a connector of this type. ${networkOutOfScope(data.items, kind.world, kind.key).length} more it would join are out of scope: on the Diagram (Show → Network, then this), the Out of scope panel brings them into the workspace to be connected.`
              : `In scope: the items in this tree, and ${(kind.inScope ?? []).length} brought in at the top. ${outOfScope(data.items, kind.world, kind.key).length} more it would take are out of scope: the Diagram's Out of scope panel brings them in (dragged onto a box, inside it; elsewhere, at the top).`}
          </p>
        </>
      )}
      {!isLinkContainer && <p className="sub">{count} link{count === 1 ? "" : "s"} of this kind.</p>}
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
      <MisfitList data={data} nav={nav} misfits={misfitLinks(data.items, kind.world).filter((m) => m.link.linkKind === kind.key)} save={save} />
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

// How a selected box is marked on the Diagram when this tree or network is shown (owner, 28 Nov):
// border colour and style, and whether it's filled with a tint of the colour.
function SelectedLook({ kind, change }: { kind: LinkKind; change: (patch: Partial<LinkKind>) => Promise<void> }) {
  return (
    <>
      <div className="sub field-group">Selected items on its diagram</div>
      <label className="colour-row">
        <span className="sub">Border colour</span>
        <input type="color" value={kind.selectedColour ?? SELECTED_COLOUR} onChange={(e) => change({ selectedColour: e.target.value })} />
        {kind.selectedColour && <button className="link" onClick={() => change({ selectedColour: undefined })}>Use the default</button>}
      </label>
      <div className="field">
        <span className="label">Border</span>
        <select value={kind.selectedLine ?? "solid"} onChange={(e) => change({ selectedLine: e.target.value === "solid" ? undefined : (e.target.value as LinkKind["selectedLine"]) })}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
      <label className="choice"><input type="checkbox" checked={kind.selectedFill !== false} onChange={() => change({ selectedFill: kind.selectedFill === false ? undefined : false })} /> Highlighted (filled with a tint)</label>
    </>
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
      <h2>What its connectors carry</h2>
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
      <h2>Diagram settings</h2>
      <div className="sub field-group">Its connectors</div>
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
        <label className="choice"><input type="checkbox" checked={kind.arrows !== false} onChange={() => change({ arrows: kind.arrows === false ? undefined : false })} /> An arrow on each connector, pointing from → to</label>
      )}
      <SelectedLook kind={kind} change={change} />
    </>
  );
}

// The items holding links under a link container kind, each with how many.
function LinkContainersOf({ data, nav, kind }: { data: AppData; nav: Nav; kind: LinkKind }) {
  const holding = linkContainersIn(data.items, kind.world)
    .map((t) => ({ t, links: linksIn(data.items, kind.world).filter((l) => l.partOf?.includes(t.key) && containerKindsFor(data.items, kind.world, l.linkKind, t.key).some((k) => k.key === kind.key)) }))
    .filter((r) => r.links.length > 0);
  return (
    <>
      <h2>Items of this kind ({holding.length})</h2>
      {holding.length === 0 && <p className="sub">None yet: on a link's card, Part of puts it in one, or makes a new one.</p>}
      <ul className="list">
        {holding.map(({ t, links }) => (
          <li key={t.key}>
            <button onClick={() => nav.open({ name: "place", key: t.key })}>
              <span className="title">{t.name}</span>
              <span className="sub">{links.length} link{links.length === 1 ? "" : "s"}</span>
            </button>
          </li>
        ))}
      </ul>
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
  } else if (kind.hierarchy === "links") {
    lines.push("A link container: an item of the kinds it's held by holds connectors of the network types it holds, many at once; a connector can be in several.");
    lines.push("On a link's card, Part of puts it in one (or makes a new one); on the container's card, Made of links lists them in order, with Along it; on maps and the Diagram, Layers ▾ → Made of links.");
    lines.push(kind.strictness === "warn" ? "What it holds (below) is a warning: misfits are allowed and flagged." : "What it holds (below) is enforced: misfits are refused.");
    return lines;
  } else {
    lines.push("A network type: each connector joins two items and contains nothing (a road, an alliance).");
    lines.push("Connect two items with it from the map or the Diagram (select two, Connect…, or the Connect mode) or an item's card (Connect to…). Its links are drawn on both, switched under Layers ▾ → Links, and listed under Connections on each item's page.");
  }
  if (kind.fields?.length) lines.push(`Each link carries ${kind.fields.map((f) => (f.byDirection ? `${f.name} (each way)` : f.name)).join(", ")}, filled in on the link's card.`);
  lines.push(kind.direction === "both ways" ? "Both ways: it reads the same from either end." : `One way: from the other end it reads "${kind.reverseName ?? `${kind.name} (from)`}".`);
  lines.push(kind.strictness === "warn" ? "What it takes (below) is a warning: misfits are allowed and flagged." : "What it takes (below) is enforced: misfits are refused.");
  return lines;
}

function kindExample(kind: LinkKind): string {
  return kind.hierarchy === "none" ? "e.g. road, feud with" : kind.hierarchy === "one parent" ? "e.g. in, part of" : kind.hierarchy === "several parents" ? "e.g. in area, member of" : "e.g. route, border";
}
