// A list in game view (owner, 24 Nov; after the Old World Builder's): each unit's lines, kit, special
// rules (tap one for its text), magic items, page and your note, filtered by the chips at the top.
// Battle tracking comes with the Battle tool (owner, 24 Nov).
// Logic: src/lists/game-view.ts.
import { useState } from "react";
import type { Context, Game, Roster } from "../../../items/items";
import { gameUnits, type GameUnit } from "../../../lists/game-view";
import type { RosterView } from "../../../lists/roster";
import { writeStat } from "../../../notation/values";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

const FILTERS = [
  { id: "points", label: "Points" },
  { id: "stats", label: "Stats" },
  { id: "kit", label: "Kit" },
  { id: "rules", label: "Special rules" },
  { id: "items", label: "Magic items" },
  { id: "pages", label: "Pages" },
  { id: "notes", label: "Notes" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

// The filters chosen are kept on this device (a convenience: lost, they're simply all on again).
function loadFilters(): Set<Filter> {
  try {
    const saved = localStorage.getItem("game-view-filters");
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(["points", "stats", "kit", "rules", "items"]);
}
function saveFilters(f: Set<Filter>) {
  try {
    localStorage.setItem("game-view-filters", JSON.stringify([...f]));
  } catch {}
}

export function GameView({ data, nav, view, save }: { data: AppData; nav: Nav; view: RosterView; save: (r: Roster) => void }) {
  const [on, setOn] = useState<Set<Filter>>(loadFilters);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const roster = view.roster;
  const units = gameUnits(view, data.items);
  const show = (f: Filter) => on.has(f);
  const toggle = (f: Filter) => {
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
    <div className="game-view">
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} className={show(f.id) ? "on" : ""} onClick={() => toggle(f.id)}>{f.label}</button>
        ))}
      </div>

      {sections.map((section) => (
        <div key={section}>
          <h2>{section} {show("points") && <span className="sub">{units.filter((u) => u.category === section).reduce((n, u) => n + u.points, 0)} pts</span>}</h2>
          {units.filter((u) => u.category === section).map((u) => (
            <UnitCard key={u.id} u={u} stats={stats} show={show} openRule={openRule} setOpenRule={setOpenRule} nav={nav} onNote={(note) => save({ ...roster, units: roster.units.map((x) => (x.id === u.id ? { ...x, note: note || undefined } : x)) })} />
          ))}
        </div>
      ))}
    </div>
  );
}

type CardProps = {
  u: GameUnit;
  stats: string[];
  show: (f: Filter) => boolean;
  openRule: string | null;
  setOpenRule: (k: string | null) => void;
  nav: Nav;
  onNote: (note: string) => void;
};

function UnitCard({ u, stats, show, openRule, setOpenRule, nav, onNote }: CardProps) {
  const cols = stats.filter((s) => u.lines.some((l) => l.stats[s] !== undefined));
  return (
    <div className="game-unit">
      <div className="game-unit-head">
        <span className="title">
          {u.name}
          {u.size > 1 && <span className="sub"> ×{u.size}</span>}
          {u.general && <span className="sub"> · General</span>}
        </span>
        {show("points") && <span className="sub">{u.points} pts</span>}
      </div>
      {show("stats") && cols.length > 0 && (
        <div className="grid-wrap">
          <table className="stats">
            <thead>
              <tr><th></th>{cols.map((s) => <th key={s}>{s}</th>)}</tr>
            </thead>
            <tbody>
              {u.lines.map((l, i) => (
                <tr key={i}><th>{l.name}</th>{cols.map((s) => <td key={s}>{writeStat(l.stats[s])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {show("kit") && u.equipment.length > 0 && <p><span className="sub">Kit </span>{u.equipment.join(", ")}{u.command.length ? <span className="sub"> · {u.command.join(", ")}</span> : null}</p>}
      {show("items") && u.items.length > 0 && (
        <p>
          <span className="sub">Magic items </span>
          {u.items.map((i, n) => (
            <span key={n}>
              {n > 0 && ", "}
              <button className="link" onClick={() => nav.open({ name: "item", key: i.key })}>{i.name}</button>
              <span className="sub"> ({i.type}{i.bearer ? `, ${i.bearer}` : ""})</span>
            </span>
          ))}
        </p>
      )}
      {show("rules") && u.rules.length > 0 && (
        <div className="game-rules">
          {u.rules.map((r, n) => {
            const id = `${u.id}|${r.name}`;
            return (
              <span key={n}>
                <button className={"rule-chip" + (openRule === id ? " on" : "")} onClick={() => setOpenRule(openRule === id ? null : id)}>{r.name}</button>
                {openRule === id && <span className="rule-text">{r.text ?? "Not entered yet."}{r.key && <> <button className="link" onClick={() => nav.open({ name: "item", key: r.key! })}>Open</button></>}</span>}
              </span>
            );
          })}
        </div>
      )}
      {show("pages") && u.page && <p className="sub">{u.page}</p>}
      {show("notes") && <textarea className="note" placeholder="Your notes" defaultValue={u.note ?? ""} onBlur={(e) => e.target.value !== (u.note ?? "") && onNote(e.target.value.trim())} />}
    </div>
  );
}
