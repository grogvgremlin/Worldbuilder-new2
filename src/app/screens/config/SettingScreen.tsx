// One setting of a game: its name, what it's about, its default, and the choices its dropdown offers
// (a label and the value written in the shorthand). Saved as you go.
import { useState } from "react";
import type { Game, GameSetting } from "../../../items/items";
import { withSetting } from "../../../context/game-config";
import { applyScaling } from "../../../settings/settings";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

export function SettingScreen({ data, nav, gameKey, index }: { data: AppData; nav: Nav; gameKey: string; index: number }) {
  const [, setChanged] = useState(0);
  const game = data.items.find((i): i is Game => i.kind === "game" && i.key === gameKey);
  if (!game) return <p>Not on the device any more.</p>;
  const setting: GameSetting = game.settings?.[index] ?? { name: "New setting", default: "full(target / 1000)", choices: {} };
  const save = async (next: GameSetting | null) => {
    await data.putItem(withSetting(game, index, next));
    setChanged((n) => n + 1);
    if (next === null) nav.back();
  };
  const choices = Object.entries(setting.choices);
  const setChoices = (list: [string, string][]) => save({ ...setting, choices: Object.fromEntries(list) });
  const check = (value: string) => {
    const r = applyScaling(value, 2500, { min: 0, max: 1 });
    return "error" in r ? r.error : `at 2,500 pts, 0–1 becomes ${r.min}–${r.max}`;
  };

  return (
    <section className="card">
      <input className="title-input" value={setting.name} onChange={(e) => save({ ...setting, name: e.target.value })} aria-label="Setting name" />
      <input className="filter" placeholder="What it controls" value={setting.about ?? ""} onChange={(e) => save({ ...setting, about: e.target.value || undefined })} />
      <p className="sub">Limits written “per 1,000” use the setting named “Per 1,000 points”; a limit can also name a setting.</p>

      <h2>Choices</h2>
      {choices.map(([label, value], i) => (
        <div key={i} className="choice-edit">
          <input className="filter" value={label} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? [e.target.value, c[1]] : c)))} />
          <input className="filter mono" value={value} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? [c[0], e.target.value] : c)))} />
          <span className="sub">{check(value)}</span>
          <span className="arrows">
            <label>
              <input type="radio" checked={setting.default === value} onChange={() => save({ ...setting, default: value })} /> default
            </label>
            <button onClick={() => setChoices(choices.filter((_, j) => j !== i))}>Remove</button>
          </span>
        </div>
      ))}
      <button className="add" onClick={() => setChoices([...choices, [`Choice ${choices.length + 1}`, "full(target / 1000)"]])}>+ Add a choice</button>
      <p className="sub">Shorthand: full(target / 1000), started(…), nearest(…), scale(target / 2000, down|up|nearest).</p>

      <div className="buttons">
        <button onClick={() => nav.back()}>Done</button>
        {index < (game.settings ?? []).length && (
          <button className="danger" onClick={() => confirm(`Remove the setting ${setting.name}?`) && save(null)}>Remove setting</button>
        )}
      </div>
    </section>
  );
}
