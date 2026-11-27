// A link's own card (owner, 26–27 Nov): its two ends, its link kind, what it carries, its dates as
// written, a note, and how it's drawn (its own colour and line, or its link kind's). Changing an end
// or the kind goes through the same check as joining; a link that no longer fits says so.
// Design: design/world-structure.md §3 (direction, carries), §7 (start and end readable on any
// dated link). Core: src/world/links.ts.
import { useState } from "react";
import type { Item, Link } from "../../../items/items";
import { changeEnd, fieldsOfLink, linkValue, removeLinkField, setLinkValue, type LinkDirection, changeLink, changeLinkKind, linkKindOf, linkKindStyle, linkKindsInOrder, linkStyle, removeLink, swapEnds } from "../../../world/links";
import { misfit } from "../../../world/kinds";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { TextBox } from "./text-box";
import { SwipeRow } from "../../swipe";

export function LinkScreen({ data, nav, linkKey }: { data: AppData; nav: Nav; linkKey: string }) {
  const [, setChanged] = useState(0);
  const link = data.items.find((i): i is Link => i.kind === "link" && i.key === linkKey);
  if (!link) return <p className="hint">This link isn't in the world any more.</p>;
  const world = link.world;
  const kind = linkKindOf(data.items, link.linkKind);
  const save = async (items: Item[]) => (await data.setItems(items), setChanged((n) => n + 1));
  const attempt = (result: { items: Item[]; problem?: string }) => (result.problem ? alert(result.problem) : save(result.items));
  const things = thingsIn(data.items, world).sort((a, b) => a.name.localeCompare(b.name));
  const name = (key: string) => things.find((t) => t.key === key)?.name ?? key;
  const why = misfit(data.items, world, link.linkKind, "from", link.from) ?? misfit(data.items, world, link.linkKind, "to", link.to);
  const style = linkStyle(data.items, world, link);
  const kindStyle = kind ? linkKindStyle(data.items, world, kind) : style;

  return (
    <article className="card link-card">
      <h1 className="link-heading">
        <button className="link" onClick={() => nav.open({ name: "place", key: link.from })}>{name(link.from)}</button>{" "}
        <span className="link-word">{kind?.name ?? link.linkKind}</span>{" "}
        <button className="link" onClick={() => nav.open({ name: "place", key: link.to })}>{name(link.to)}</button>
      </h1>
      {kind?.reverseName && kind.direction === "one-way" && <p className="sub">Read from {name(link.to)}: {kind.reverseName} {name(link.from)}.</p>}
      {why && (
        <p className="sub warn">
          ⚠ {why} · <button className="link" onClick={() => nav.open({ name: "link-kind", key: link.linkKind })}>Change what it takes</button>
        </p>
      )}

      <h2>Ends</h2>
      <div className="field">
        <span className="label">{kind?.direction === "both ways" ? "One end" : "From"}</span>
        <select value={link.from} onChange={(e) => attempt(changeEnd(data.items, world, link.key, "from", e.target.value))}>
          {things.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      <div className="field">
        <span className="label">{kind?.direction === "both ways" ? "The other" : "To"}</span>
        <select value={link.to} onChange={(e) => attempt(changeEnd(data.items, world, link.key, "to", e.target.value))}>
          {things.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      {kind?.direction === "one-way" && <button onClick={() => attempt(swapEnds(data.items, world, link.key))}>⇄ Swap ends</button>}

      <h2>Link kind</h2>
      <div className="field">
        <span className="label">Kind</span>
        <select value={link.linkKind} onChange={(e) => attempt(changeLinkKind(data.items, world, link.key, e.target.value))}>
          {linkKindsInOrder(data.items, world).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
        </select>
      </div>
      <p className="sub"><button className="link" onClick={() => nav.open({ name: "link-kind", key: link.linkKind })}>Open "{kind?.name ?? link.linkKind}"</button>: what it takes, what it carries, how its links are drawn.</p>

      <Carries data={data} link={link} name={name} save={save} />

      <h2>When</h2>
      <p className="sub">As written, until calendars come.</p>
      <div className="field">
        <span className="label">Start</span>
        <TextBox className="field-box" value={link.start ?? ""} placeholder="e.g. 2502, or the Great Plague" onSave={(v) => save(changeLink(data.items, link.key, { start: v }))} />
      </div>
      <div className="field">
        <span className="label">End</span>
        <TextBox className="field-box" value={link.end ?? ""} placeholder="blank: still so" onSave={(v) => save(changeLink(data.items, link.key, { end: v }))} />
      </div>

      <h2>Note</h2>
      <TextBox multiline className="description-box" value={link.note ?? ""} placeholder="Why, who says so, what came of it" onSave={(v) => save(changeLink(data.items, link.key, { note: v }))} />

      <h2>How it's drawn</h2>
      <label className="colour-row">
        <span className="sub">Colour</span>
        <input type="color" value={style.colour} onChange={(e) => save(changeLink(data.items, link.key, { colour: e.target.value }))} />
        {link.colour && <button className="link" onClick={() => save(changeLink(data.items, link.key, { colour: undefined }))}>Use the link kind's</button>}
      </label>
      <div className="field">
        <span className="label">Line</span>
        <select value={link.line ?? ""} onChange={(e) => save(changeLink(data.items, link.key, { line: (e.target.value || undefined) as Link["line"] }))}>
          <option value="">The link kind's ({kindStyle.line})</option>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>

      <div className="buttons">
        <button className="danger" onClick={async () => {
          if (!confirm(`Remove this link: ${name(link.from)} ${kind?.name ?? ""} ${name(link.to)}?`)) return;
          await data.setItems(removeLink(data.items, link.key));
          nav.back();
        }}>Remove this link</button>
      </div>
    </article>
  );
}

// What it carries: its link kind's fields, then any of its own. A field kept each way has a value for
// each direction, named by its ends ("Nuln → Wurtbad"). Swipe one of its own fields left to remove it.
function Carries({ data, link, name, save }: { data: AppData; link: Link; name: (key: string) => string; save: (items: Item[]) => Promise<void> }) {
  const [own, setOwn] = useState("");
  const [ownEachWay, setOwnEachWay] = useState(false);
  // Fields of its own just added: shown until they have a value (a link keeps only filled-in fields).
  const [pending, setPending] = useState<{ name: string; byDirection: boolean; offered: boolean }[]>([]);
  const stored = fieldsOfLink(data.items, link);
  const fields = [...stored, ...pending.filter((p) => !stored.some((f) => f.name === p.name))];
  const ways: { direction: LinkDirection; label: string }[] = [
    { direction: "from to", label: `${name(link.from)} → ${name(link.to)}` },
    { direction: "to from", label: `${name(link.to)} → ${name(link.from)}` },
  ];
  const addOwn = async () => {
    const n = own.trim();
    if (!n || fields.some((f) => f.name.toLowerCase() === n.toLowerCase())) return;
    setPending([...pending, { name: n, byDirection: ownEachWay, offered: false }]);
    setOwn("");
    setOwnEachWay(false);
  };
  const box = (field: string, direction?: LinkDirection) => (
    <TextBox className="field-box" value={linkValue(link, field, direction)} placeholder="e.g. 40 miles, +2" onSave={(v) => save(setLinkValue(data.items, link.key, field, v, direction))} />
  );
  return (
    <>
      <h2>What it carries</h2>
      {fields.length === 0 && <p className="sub">Its link kind offers no fields: add them there (what its links carry), or give this link one of its own below.</p>}
      {fields.map((f) => {
        const rows = f.byDirection ? (
          ways.map((w) => (
            <div key={w.direction} className="field">
              <span className="label">{f.name} <span className="sub">{w.label}</span></span>
              {box(f.name, w.direction)}
            </div>
          ))
        ) : (
          <div className="field">
            <span className="label">{f.name}</span>
            {box(f.name)}
          </div>
        );
        return f.offered ? <div key={f.name}>{rows}</div> : (
          <SwipeRow key={f.name} action="Remove" onAction={() => (setPending(pending.filter((p) => p.name !== f.name)), save(removeLinkField(data.items, link.key, f.name)))}>
            <div>{rows}</div>
          </SwipeRow>
        );
      })}
      <div className="inline-add">
        <input className="filter" placeholder="A field just for this link" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOwn()} />
        <button onClick={addOwn}>Add</button>
      </div>
      <label className="choice"><input type="checkbox" checked={ownEachWay} onChange={() => setOwnEachWay(!ownEachWay)} /> each way</label>
    </>
  );
}
