// An upload waiting: what it would add, change and remove, names it couldn't match, problems.
// Nothing reaches the library until it's added.
import YAML from "yaml";
import type { Item } from "../../items/items";
import type { ClashChoice } from "../../library/library";
import type { Draft } from "../app-data";

type Props = { draft: Draft; onAccept: () => void; onDiscard: () => void; onChoose: (key: string, choice: ClashChoice) => void };

export function DraftScreen({ draft, onAccept, onDiscard, onChoose }: Props) {
  const { plan, problems } = draft;
  const nothing = plan.added.length + plan.changed.length + plan.removed.length === 0 && plan.clashes.length === 0;
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
      {plan.clashes.length > 0 && (
        <>
          <h2 className="warn">Same name, different content ({plan.clashes.length})</h2>
          <p className="hint">Another book already has these names. Choose for each; nothing is added until every one is chosen.</p>
          {plan.clashes.map((c) => (
            <div key={c.key} className="clash">
              <b>{c.name}</b>
              <details>
                <summary className="sub">Compare</summary>
                <div className="compare">
                  <pre className="text">{YAML.stringify(strip(c.existing))}</pre>
                  <pre className="text">{YAML.stringify(strip(c.incoming))}</pre>
                </div>
              </details>
              {(
                [
                  ["existing", `Keep the one in ${c.existing.homePackage?.split(".").pop()}: the new book uses it`],
                  ["new", "Take the new one: both books use it"],
                  ["both", "Keep both: each book uses its own"],
                ] as [ClashChoice, string][]
              ).map(([value, label]) => (
                <label key={value} className="choice">
                  <input type="radio" name={`clash-${c.key}`} checked={c.choice === value} onChange={() => onChoose(c.key, value)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ))}
        </>
      )}
      <Group title="New" items={plan.added} />
      <Group title="Changed" items={plan.changed} />
      <Group title="Removed (no longer in the package)" items={plan.removed} />
      {plan.unchanged.length > 0 && <p className="sub">{plan.unchanged.length} unchanged</p>}
      {plan.shared.length > 0 && <p className="sub">Already in another book, the same: {plan.shared.map((i) => i.name).join(", ")} (kept once)</p>}
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
        <button className="primary" disabled={nothing || plan.undecided} onClick={onAccept}>
          {nothing ? "Nothing to add" : plan.undecided ? "Choose for each clash first" : "Add to library"}
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

// An item as compared: its content, without the keys the app works out.
function strip(item: Item): unknown {
  return JSON.parse(JSON.stringify(item, (k, v) => (k === "item" || k === "key" ? undefined : v)));
}
