// A game's configuration on its Library page, all editable: core packages, default composition,
// presets (what "Start from" offers), settings (what the Advanced dropdowns offer), and the statline,
// categories and troop types.
import { useState } from "react";
import type { Game } from "../../../items/items";
import { compositionSets, gamePackages, movePreset } from "../../../context/game-config";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

// Stays open when you come back from editing a preset or a setting.
let configOpen = false;

export function GameConfig({ data, nav, game, onSaved }: { data: AppData; nav: Nav; game: Game; onSaved: () => void }) {
  const save = async (next: Game) => {
    await data.putItem(next);
    onSaved();
  };
  const packages = gamePackages(game, data.items);
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <details className="list-settings config" open={configOpen} onToggle={(e) => (configOpen = (e.target as HTMLDetailsElement).open)}>
      <summary>Configuration</summary>
      <p className="sub">What this game starts with and offers. Changes here download with the game.</p>

      <h3>Statline and categories</h3>
      <p className="sub">Separated by commas. The statline is shown on cards in this order; the categories are the army list's sections. (The sheets' stat columns are still M to Ld: a different statline there comes next.)</p>
      <ListField label="Statline" value={game.statlines.model} onSave={(model) => save({ ...game, statlines: { ...game.statlines, model } })} />
      <ListField label="Categories" value={game.categories} onSave={(categories) => save({ ...game, categories })} />
      <ListField label="Troop types" value={game.troopTypes ?? []} onSave={(troopTypes) => save({ ...game, troopTypes })} />

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

      <h3>Presets: what “Start from” offers</h3>
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

      <h3>Settings: what the Advanced dropdowns offer</h3>
      <ul className="plain">
        {(game.settings ?? []).map((s, i) => (
          <li key={i}>
            <button className="link" onClick={() => nav.open({ name: "game-setting", game: game.key, index: i })}>{s.name}</button>
            <span className="sub"> default {Object.entries(s.choices).find(([, v]) => v === s.default)?.[0] ?? s.default}</span>
          </li>
        ))}
      </ul>
      <button className="add" onClick={() => nav.open({ name: "game-setting", game: game.key, index: (game.settings ?? []).length })}>+ New setting</button>
    </details>
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
