// A pick-up game: the game's rules switched on for it (its core always, your books, FAQs, house rules,
// a composition set), what each brings with it, and the lists built in it.
import { useState } from "react";
import type { ArmyList, Context, Roster } from "../../../items/items";
import { GROUPS, offered, readContext, removeFromContext, switchOff, switchOn } from "../../../context/context";
import { armyListsIn, newRoster, viewRoster } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { SwipeRow } from "../../swipe";

export function PickupGameScreen({ data, nav, contextKey }: { data: AppData; nav: Nav; contextKey: string }) {
  const [, setChanged] = useState(0);
  const context = data.items.find((i): i is Context => i.kind === "context" && i.key === contextKey);
  if (!context) return <p>Not on the device any more.</p>;
  const view = readContext(context, data.items);
  const offer = offered(context, data.items);
  const save = async (next: Context) => {
    await data.putItem(next);
    setChanged((n) => n + 1);
  };
  const rosters = data.items.filter((i): i is Roster => i.kind === "roster" && i.context === context.key);
  const listed = new Set(GROUPS.flatMap(({ group }) => context[group].map((p) => p.package)));

  return (
    <section>
      <h1>{context.name}</h1>
      <p className="sub">{view.game?.name ?? context.game}</p>

      <h2>Lists</h2>
      <ul className="list">
        {rosters.map((r) => {
          const rv = viewRoster(r, data.items);
          return (
            <li key={r.key}>
              <SwipeRow
                action="Remove"
                onAction={async () => {
                  if (!confirm(`Remove ${r.name}?`)) return;
                  await data.removeItems([r.key]);
                  setChanged((n) => n + 1);
                }}
              >
                <button onClick={() => nav.open({ name: "roster", key: r.key })}>
                  <span className="title">{r.name}</span>
                  <span className={"sub" + (rv.issues.length ? " warn" : "")}>
                    {rv.armyList?.name} · {rv.total}/{r.target}
                    {rv.issues.length ? ` · ${rv.issues.length} to fix` : ""}
                  </span>
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
      <NewList data={data} context={context} lists={armyListsIn(context, data.items)} onMade={(r) => nav.open({ name: "roster", key: r.key })} />

      <h2>Rules in this game</h2>
      <ul className="plain rules-on">
        {view.packages.filter((p) => !(data.items.find((i) => i.key === p.key) as { stubsFor?: string } | undefined)?.stubsFor).map((p) => (
          <li key={p.key}>
            {p.how === "chosen" && listed.has(p.key) ? (
              <label>
                <input type="checkbox" checked={p.on} onChange={() => save(p.on ? switchOff(context, p.key, data.items) : switchOn(context, p.key, data.items))} /> {p.name}
              </label>
            ) : (
              <span className={p.on ? "" : "sub"}>
                {p.name} <span className="sub">{p.how === "core" ? "always on" : p.neededBy.length ? `needed by ${p.neededBy.join(", ")}` : ""}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {view.warnings.length > 0 && <ul className="plain problems">{view.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

      {GROUPS.filter((g) => offer.get(g.group)?.length).map((g) => (
        <div key={g.group}>
          <h2>Add: {g.title}</h2>
          <div className="buttons">
            {offer.get(g.group)!.map((p) => (
              <button key={p.key} onClick={() => save(switchOn(context, p.key, data.items))}>+ {p.name}</button>
            ))}
          </div>
        </div>
      ))}
      {GROUPS.some(({ group }) => context[group].some((p) => !p.on)) && (
        <p className="sub">
          Switched off here:{" "}
          {GROUPS.flatMap(({ group }) => context[group].filter((p) => !p.on)).map((p) => (
            <button key={p.package} className="link" onClick={() => save(removeFromContext(context, p.package))}>
              {data.items.find((i) => i.key === p.package)?.name ?? p.package} (forget)
            </button>
          ))}
        </p>
      )}
    </section>
  );
}

function NewList({ data, context, lists, onMade }: { data: AppData; context: Context; lists: ArmyList[]; onMade: (r: Roster) => void }) {
  const [name, setName] = useState("");
  const [list, setList] = useState(lists[0]?.key ?? "");
  const [target, setTarget] = useState(1000);
  if (lists.length === 0) return <p className="hint">Switch on an army book below to start a list.</p>;
  const make = async () => {
    const armyList = lists.find((l) => l.key === (list || lists[0].key))!;
    const roster = newRoster(name.trim() || `${armyList.name} ${target}`, context, armyList, target, data.items);
    await data.putItem(roster);
    onMade(roster);
  };
  return (
    <div className="form">
      <div className="row">
        <input className="filter" placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row">
        {lists.length > 1 && (
          <select value={list} onChange={(e) => setList(e.target.value)}>
            {lists.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
          </select>
        )}
        <label className="points">
          <input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} /> pts
        </label>
        <button className="primary" onClick={make}>New list</button>
      </div>
    </div>
  );
}
