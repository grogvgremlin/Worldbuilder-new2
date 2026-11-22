// An upload waiting: what it would add, change and remove, names it couldn't match, problems.
// Nothing reaches the library until it's added.
import type { Item } from "../../items/items";
import type { Draft } from "../app-data";

export function DraftScreen({ draft, onAccept, onDiscard }: { draft: Draft; onAccept: () => void; onDiscard: () => void }) {
  const { plan, problems } = draft;
  const nothing = plan.added.length + plan.changed.length + plan.removed.length === 0;
  return (
    <section>
      <h1>Upload to review</h1>
      <p className="sub">{draft.fileNames.join(", ")}</p>
      {problems.length > 0 && (
        <>
          <h2 className="warn">{problems.length} problem{problems.length > 1 ? "s" : ""}</h2>
          <ul className="plain problems">
            {problems.map((p, i) => (
              <li key={i}>
                <b>{p.where}</b>: {p.message}
              </li>
            ))}
          </ul>
        </>
      )}
      <Group title="New" items={plan.added} />
      <Group title="Changed" items={plan.changed} />
      <Group title="Removed (no longer in the package)" items={plan.removed} />
      {plan.unchanged.length > 0 && <p className="sub">{plan.unchanged.length} unchanged</p>}
      {plan.stubbed.length > 0 && (
        <>
          <h2>Names that match nothing ({new Set(plan.stubbed.map((u) => u.name)).size})</h2>
          <p className="hint">Kept as stubs, flagged “not entered yet”, until the real item is loaded.</p>
          <ul className="plain">
            {[...new Map(plan.stubbed.map((u) => [u.name, u])).values()].map((u) => (
              <li key={u.name}>
                <b>{u.name}</b> <span className="sub">{u.where}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="buttons sticky">
        <button className="primary" disabled={nothing} onClick={onAccept}>
          {nothing ? "Nothing to add" : "Add to library"}
        </button>
        <button onClick={onDiscard}>Discard</button>
      </div>
    </section>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  const byKind = new Map<string, Item[]>();
  for (const i of items) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  return (
    <>
      <h2>
        {title} ({items.length})
      </h2>
      <ul className="plain">
        {[...byKind].map(([kind, list]) => (
          <li key={kind}>
            <b>{kind.replace("-", " ")}</b>: {list.map((i) => i.name).join(", ")}
          </li>
        ))}
      </ul>
    </>
  );
}
