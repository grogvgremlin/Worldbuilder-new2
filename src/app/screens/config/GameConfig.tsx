// A game's configuration on its Library page, all editable: core packages, default composition,
// presets (what "Start from" offers), settings (what the Advanced dropdowns offer), and the statline,
// categories and troop types.
import { useState } from "react";
import type { Game, RaceDimension } from "../../../items/items";
import { changeDimensions, dimensionsOf, type DimensionChange } from "../../../items/race-dimensions";
import { compositionSets, gamePackages, movePreset } from "../../../context/game-config";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";


export function GameConfig({ data, nav, game, onSaved }: { data: AppData; nav: Nav; game: Game; onSaved: () => void }) {
  const save = async (next: Game) => {
    await data.putItem(next);
    onSaved();
  };
  const packages = gamePackages(game, data.items);
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <div className="config">
      <Fold id={`${game.key}|core`} title="Core and default composition">
        <h3>Core: always on</h3>
        {packages
          .filter((p) => p.layer === "core")
          .map((p) => (
            <label key={p.key} className="choice">
              <input type="checkbox" checked={game.core.includes(p.key)} onChange={() => save({ ...game, core: toggle(game.core, p.key) })} />
              <span>{p.name}</span>
            </label>
          ))}
        <h3>Default composition</h3>
        {compositionSets(game, data.items).map((p) => (
          <label key={p.key} className="choice">
            <input
              type="checkbox"
              checked={(game.defaultComposition ?? []).includes(p.key)}
              onChange={() => save({ ...game, defaultComposition: toggle(game.defaultComposition ?? [], p.key) })}
            />
            <span>{p.name}</span>
          </label>
        ))}
      </Fold>

      <Fold id={`${game.key}|presets`} title="Presets: what “Start from” offers">
        <ul className="plain">
          {(game.presets ?? []).map((p, i) => (
            <li key={i} className="config-row">
              <button className="link" onClick={() => nav.open({ name: "preset", game: game.key, index: i })}>{p.name}</button>
              <span className="sub"> {p.about}</span>
              <span className="arrows">
                <button disabled={i === 0} onClick={() => save(movePreset(game, i, -1))}>↑</button>
                <button disabled={i === (game.presets ?? []).length - 1} onClick={() => save(movePreset(game, i, 1))}>↓</button>
              </span>
            </li>
          ))}
        </ul>
        <button className="add" onClick={() => nav.open({ name: "preset", game: game.key, index: (game.presets ?? []).length })}>+ New preset</button>
      </Fold>

      <Fold id={`${game.key}|settings`} title="Settings: what the Advanced dropdowns offer">
        <ul className="plain">
          {(game.settings ?? []).map((st, i) => (
            <li key={i}>
              <button className="link" onClick={() => nav.open({ name: "game-setting", game: game.key, index: i })}>{st.name}</button>
              <span className="sub"> default {Object.entries(st.choices).find(([, v]) => v === st.default)?.[0] ?? st.default}</span>
            </li>
          ))}
        </ul>
        <button className="add" onClick={() => nav.open({ name: "game-setting", game: game.key, index: (game.settings ?? []).length })}>+ New setting</button>
      </Fold>

      <Fold id={`${game.key}|statline`} title="Statline and categories">
        <p className="sub">Separated by commas. The statline is shown on cards in this order; the categories are the army list's sections. (The sheets' stat columns are still M to Ld.)</p>
        <ListField label="Statline" value={game.statlines.model} onSave={(model) => save({ ...game, statlines: { ...game.statlines, model } })} />
        <ListField label="Categories" value={game.categories} onSave={(categories) => save({ ...game, categories })} />
        <ListField label="Troop types" value={game.troopTypes ?? []} onSave={(troopTypes) => save({ ...game, troopTypes })} />
      </Fold>

      <Fold id={`${game.key}|app`} title="App only">
        <h3>Race dimensions</h3>
        <p className="sub">
          The race grid's dimensions, in order. Each is a column on the Races tab (and on units); “blank means” is what an empty cell stands for. A change
          applies at once: a renamed dimension is renamed in every profile and unit, and profiles are keyed again.
        </p>
        <RaceDimensions
          dims={dimensionsOf(game)}
          onSave={async (change) => {
            const { items, problems } = changeDimensions(data.items, game, change);
            if (problems.length) return alert(`Not changed:\n${problems.join("\n")}`);
            await data.setItems(items);
            onSaved();
          }}
        />
      </Fold>
    </div>
  );
}

// A section that folds; open ones stay open while the app is (owner, 23 Nov: "its own collapsible").
const openFolds = new Set<string>();
function Fold({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <details className="list-settings" open={openFolds.has(id)} onToggle={(e) => ((e.target as HTMLDetailsElement).open ? openFolds.add(id) : openFolds.delete(id))}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

// The race dimensions as rows: name, what blank means, order, remove; and add. Each row remembers the
// name it had, so a rename can be carried through the profiles.
type DimRow = RaceDimension & { was?: string };
function RaceDimensions({ dims, onSave }: { dims: RaceDimension[]; onSave: (change: DimensionChange) => void }) {
  const [rows, setRows] = useState<DimRow[]>(dims.map((d) => ({ ...d, was: d.name })));
  const commit = (next: DimRow[]) => {
    const kept = next.filter((d) => d.name.trim());
    const renames: Record<string, string> = {};
    for (const d of kept) if (d.was && d.was !== d.name.trim()) renames[d.was] = d.name.trim();
    const clean = kept.map((d) => (d.blank?.trim() ? { name: d.name.trim(), blank: d.blank.trim() } : { name: d.name.trim() }));
    setRows(next.map((d) => (d.name.trim() ? { ...d, was: d.name.trim() } : d)));
    if (JSON.stringify(clean) !== JSON.stringify(dims) || Object.keys(renames).length) onSave({ dims: clean, renames });
  };
  const set = (i: number, change: Partial<DimRow>) => setRows(rows.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    commit(next);
  };
  return (
    <div className="dims">
      {rows.map((d, i) => (
        <div key={i} className="row">
          <input className="filter" placeholder="Name" value={d.name} onChange={(e) => set(i, { name: e.target.value })} onBlur={() => commit(rows)} />
          <input className="filter" placeholder="Blank means" value={d.blank ?? ""} onChange={(e) => set(i, { blank: e.target.value })} onBlur={() => commit(rows)} />
          <span className="arrows">
            <button disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button disabled={rows.length === 1} onClick={() => confirm(`Remove the dimension ${d.name}?`) && commit(rows.filter((_, j) => j !== i))}>×</button>
          </span>
        </div>
      ))}
      <button className="add" onClick={() => setRows([...rows, { name: "" }])}>+ Add a dimension</button>
    </div>
  );
}

// A list edited as text, "M, WS, BS …"; saved when you leave the box.
function ListField({ label, value, onSave }: { label: string; value: string[]; onSave: (list: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <label className="stack">
      <span className="sub">{label}</span>
      <input
        className="filter"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const list = text.split(",").map((x) => x.trim()).filter(Boolean);
          if (list.join("|") !== value.join("|")) onSave(list);
        }}
      />
    </label>
  );
}
