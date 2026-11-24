// The race grid as a table, any way round: dimensions down the side, every stat or one dimension
// across, and "only" values for the rest. Logic: src/library/race-table.ts.
import { useState } from "react";
import type { RaceProfile } from "../../items/items";
import { dimensionsOf, gameOf } from "../../items/race-dimensions";
import { raceTable, valuesOf, type TableChoice } from "../../library/race-table";
import type { AppData } from "../app-data";
import type { Nav } from "../App";

let lastChoice: TableChoice | null = null; // kept while the app is open

export function RaceTable({ data, nav, profiles }: { data: AppData; nav: Nav; profiles: RaceProfile[] }) {
  const game = profiles[0] ? gameOf(profiles[0].key, data.items) : undefined;
  const dims = dimensionsOf(game);
  const stats = game?.statlines.model ?? [];
  const [choice, setChoiceState] = useState<TableChoice>(lastChoice ?? { down: [dims[0].name], across: "Stats", stat: stats[1] ?? stats[0] ?? "", only: {} });
  const setChoice = (c: TableChoice) => setChoiceState((lastChoice = c));
  if (profiles.length === 0) return null;
  const table = raceTable(profiles, dims, stats, choice);
  const free = dims.map((d) => d.name).filter((d) => !choice.down.includes(d) && d !== choice.across);
  const toggleDown = (d: string) =>
    setChoice({ ...choice, down: choice.down.includes(d) ? choice.down.filter((x) => x !== d) : [...choice.down, d], across: choice.across === d ? "Stats" : choice.across });

  return (
    <div className="race-table">
      <div className="chips">
        <span className="sub">Down</span>
        {dims.map((d) => (
          <button key={d.name} className={choice.down.includes(d.name) ? "on" : ""} onClick={() => toggleDown(d.name)}>{d.name}</button>
        ))}
      </div>
      <div className="row">
        <label className="stack">
          <span className="sub">Across</span>
          <select value={choice.across} onChange={(e) => setChoice({ ...choice, across: e.target.value })}>
            <option value="Stats">Every stat</option>
            {dims.filter((d) => !choice.down.includes(d.name)).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </label>
        {choice.across !== "Stats" && (
          <label className="stack">
            <span className="sub">Showing</span>
            <select value={choice.stat} onChange={(e) => setChoice({ ...choice, stat: e.target.value })}>
              {stats.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {free.map((d) => (
          <label key={d} className="stack">
            <span className="sub">Only {d}</span>
            <select value={choice.only[d] ?? ""} onChange={(e) => setChoice({ ...choice, only: { ...choice.only, [d]: e.target.value } })}>
              <option value="">any</option>
              {valuesOf(profiles, dims, d).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              {table.labelColumns.map((c) => <th key={c}>{c}</th>)}
              {table.columns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.label.map((l, j) => <th key={j}>{l}</th>)}
                {r.cells.map((c, j) => (
                  <td key={j} onClick={() => r.keys[j] && nav.open({ name: "item", key: r.keys[j]! })}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
