// A list in game view (owner, 24 Nov; after the Old World Builder's): each unit's stat lines, its
// equipment and command (each model with its own kit), its special rules (tap one for its précis, ↗
// for its card), magic items, page and your note. "Show" picks what's there; "Print" lays it out for
// paper, each rule written out. Turned sideways, units sit two abreast. Battle tracking comes with the
// Battle tool. Logic: src/lists/game-view.ts.
import { useState } from "react";
import type { Context, Game, Roster } from "../../../items/items";
import { gameUnits, type GameUnit } from "../../../lists/game-view";
import type { RosterView } from "../../../lists/roster";
import { writeStat } from "../../../notation/values";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { ShowMenu } from "../../filter-menu";
import { ItemPopup } from "../ItemPopup";

const FILTERS = [
  { id: "points", label: "Points" },
  { id: "stats", label: "Stats" },
  { id: "kit", label: "Equipment and command" },
  { id: "rules", label: "Special rules" },
  { id: "items", label: "Magic items" },
  { id: "pages", label: "Pages" },
  { id: "notes", label: "Notes" },
  { id: "print", label: "Print: rules written out" },
];

// What's shown is kept on this device (a convenience: lost, it's simply the default again).
function loadFilters(): Set<string> {
  try {
    const saved = localStorage.getItem("game-view-filters");
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(["points", "stats", "kit", "rules", "items"]);
}
function saveFilters(f: Set<string>) {
  try {
    localStorage.setItem("game-view-filters", JSON.stringify([...f]));
  } catch {}
}

export function GameView({ data, nav, view, save }: { data: AppData; nav: Nav; view: RosterView; save: (r: Roster) => void }) {
  const [on, setOn] = useState<Set<string>>(loadFilters);
  const [popup, setPopup] = useState<string | null>(null);
  const roster = view.roster;
  const units = gameUnits(view, data.items);
  const toggle = (f: string) => {
    const next = new Set(on);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    saveFilters(next);
    setOn(next);
  };
  const context = data.items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const stats = data.items.find((i): i is Game => i.kind === "game" && i.shortName === context?.game)?.statlines.model ?? [];
  const sections = [...new Set((view.armyList?.entries ?? []).map((e) => e.category))].filter((c) => units.some((u) => u.category === c));

  return (
    <div className={"game-view" + (on.has("print") ? " print" : "")}>
      <ShowMenu options={FILTERS} on={on} onToggle={toggle} />
      {sections.map((section) => (
        <div key={section}>
          <h2>
            {section} {on.has("points") && <span className="sub">{units.filter((u) => u.category === section).reduce((n, u) => n + u.points, 0)} pts</span>}
          </h2>
          <div className="game-units">
            {units.filter((u) => u.category === section).map((u) => (
              <UnitCard
                key={u.id}
                u={u}
                stats={stats}
                on={on}
                openItem={setPopup}
                onNote={(note) => save({ ...roster, units: roster.units.map((x) => (x.id === u.id ? { ...x, note: note || undefined } : x)) })}
              />
            ))}
          </div>
        </div>
      ))}
      {popup && <ItemPopup data={data} nav={nav} itemKey={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

type CardProps = { u: GameUnit; stats: string[]; on: Set<string>; openItem: (key: string) => void; onNote: (note: string) => void };

function UnitCard({ u, stats, on, openItem, onNote }: CardProps) {
  const [openRule, setOpenRule] = useState<number | null>(null);
  const print = on.has("print");
  const cols = stats.filter((s) => u.lines.some((l) => l.stats[s] !== undefined));
  const named = u.lines.length > 1; // one line: no name column
  const link = (name: string, key: string | undefined) => (key ? <button className="link" onClick={() => openItem(key)}>{name}</button> : <span>{name}</span>);

  return (
    <div className="game-unit">
      <div className="game-unit-head">
        <span className="title">
          {u.name}
          {u.size > 1 && <span className="sub"> ×{u.size}</span>}
          {u.general && <span className="sub"> · General</span>}
        </span>
        {on.has("points") && <span className="sub">{u.points} pts</span>}
      </div>

      {on.has("stats") && cols.length > 0 && (
        <div className="grid-wrap">
          <table className="stats">
            <thead>
              <tr>
                {named && <th></th>}
                {cols.map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {u.lines.map((l, i) => (
                <tr key={i}>
                  {named && <th>{l.name}</th>}
                  {cols.map((s) => <td key={s}>{writeStat(l.stats[s])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {on.has("kit") && (u.equipment.length > 0 || u.command.length > 0) && (
        <details className="game-section" open>
          <summary>Equipment{u.command.length > 0 ? " and command" : ""}</summary>
          {u.equipment.length > 0 && <p><span className="sub">Equipment: </span>{u.equipment.join(", ")}</p>}
          {u.command.map((c) => (
            <p key={c.section}>
              <span className="sub">{c.section}: </span>
              {c.models.map((m, i) => (
                <span key={m.name}>
                  {i > 0 && ", "}
                  {m.name}
                  {m.kit.length > 0 && <span className="sub"> · {m.kit.join(", ")}</span>}
                </span>
              ))}
            </p>
          ))}
        </details>
      )}

      {on.has("items") && u.items.length > 0 && (
        <p>
          <span className="sub">Magic items: </span>
          {u.items.map((i, n) => (
            <span key={n}>
              {n > 0 && ", "}
              {link(i.name, i.key)}
              <span className="sub"> ({i.type})</span>
            </span>
          ))}
        </p>
      )}

      {on.has("rules") && u.rules.length > 0 && (
        <details className="game-section" open>
          <summary>Rules</summary>
          {print ? (
            <ul className="print-rules">
              {u.rules.map((r, n) => (
                <li key={n}>
                  <b>{r.name}</b>: {r.text ?? "not entered yet"}
                </li>
              ))}
            </ul>
          ) : (
            // Tapping a rule opens its précis on a row of its own; the rules after it move below.
            <div className="game-rules">
              {u.rules.flatMap((r, n) => {
                const parts = [
                  <button key={`r${n}`} className={"link rule-link" + (openRule === n ? " on" : "")} onClick={() => setOpenRule(openRule === n ? null : n)}>
                    {r.name}
                  </button>,
                ];
                if (openRule === n)
                  parts.push(
                    <div key={`t${n}`} className="rule-text">
                      {r.text ?? "Not entered yet."}
                      {r.key && <button className="link" aria-label="Open the rule's card" onClick={() => openItem(r.key!)}> ↗</button>}
                    </div>,
                  );
                return parts;
              })}
            </div>
          )}
        </details>
      )}

      {on.has("pages") && u.page && <p className="sub">{u.page}</p>}
      {on.has("notes") && <textarea className="note" placeholder="Your notes" defaultValue={u.note ?? ""} onBlur={(e) => e.target.value !== (u.note ?? "") && onNote(e.target.value.trim())} />}
    </div>
  );
}
