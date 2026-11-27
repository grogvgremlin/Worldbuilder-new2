// A link's own card (owner, 26–27 Nov): its two ends, its link kind, what it carries, its dates as
// written, a note, and how it's drawn (its own colour and line, or its link kind's). Changing an end
// or the kind goes through the same check as joining; a link that no longer fits says so.
// Design: design/world-structure.md §3 (direction, carries), §7 (start and end readable on any
// dated link). Core: src/world/links.ts.
import { useState } from "react";
import type { Item, Link } from "../../../items/items";
import { carried, changeEnd, changeLink, changeLinkKind, linkKindOf, linkKindStyle, linkKindsInOrder, linkStyle, removeLink, swapEnds } from "../../../world/links";
import { misfit } from "../../../world/kinds";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { TextBox } from "./text-box";

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
  const valueName = carried(kind);
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

      {(valueName || link.value) && (
        <div className="field">
          <span className="label">{valueName ?? "Value"}</span>
          <TextBox className="field-box" value={link.value ?? ""} placeholder="e.g. +2, 40 miles" onSave={(v) => save(changeLink(data.items, link.key, { value: v }))} />
        </div>
      )}

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
