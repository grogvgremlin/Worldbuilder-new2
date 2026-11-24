// Lists → Pick-up: the permanent sandbox with no world features. Its contexts (a game and its
// packages, each holding lists) persist; start a new one from a game and one of its presets.
// The sandbox field is never shown here (owner, 22 Nov).
import { useState } from "react";
import { PICKUP, type Context, type Game, type Roster } from "../../../items/items";
import { fromPreset } from "../../../context/context";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { SwipeRow } from "../../swipe";

export function ListsScreen({ data, nav }: { data: AppData; nav: Nav }) {
  const [, setChanged] = useState(0);
  const games = data.items.filter((i): i is Game => i.kind === "game");
  const contexts = data.items.filter((i): i is Context => i.kind === "context" && (i.sandbox ?? PICKUP) === PICKUP);
  const rostersIn = (c: Context) => data.items.filter((i): i is Roster => i.kind === "roster" && i.context === c.key);

  const remove = async (c: Context) => {
    const rosters = rostersIn(c);
    if (!confirm(`Remove ${c.name}${rosters.length ? ` and its ${rosters.length} list${rosters.length > 1 ? "s" : ""}` : ""}?`)) return;
    await data.removeItems([c.key, ...rosters.map((r) => r.key)]);
    setChanged((n) => n + 1);
  };

  return (
    <section>
      <h1>Pick-up</h1>
      {games.length === 0 && <p className="hint">No game loaded yet: add one in Settings → Library first.</p>}
      <ul className="list">
        {contexts.map((c) => (
          <li key={c.key}>
            <SwipeRow action="Remove" onAction={() => remove(c)}>
              <button onClick={() => nav.open({ name: "pickup", key: c.key })}>
                <span className="title">{c.name}</span>
                <span className="sub">
                  {games.find((g) => g.shortName === c.game)?.name ?? c.game} · {rostersIn(c).length} lists
                </span>
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
      {games.length > 0 && <NewContext data={data} games={games} onMade={(c) => nav.open({ name: "pickup", key: c.key })} />}
    </section>
  );
}

// Game first, then a preset (or blank), then a name.
function NewContext({ data, games, onMade }: { data: AppData; games: Game[]; onMade: (c: Context) => void }) {
  const [gameKey, setGameKey] = useState(games[0].key);
  const game = games.find((g) => g.key === gameKey) ?? games[0];
  const [preset, setPreset] = useState(game.presets?.[0]?.name ?? "");
  const [name, setName] = useState("");
  const make = async () => {
    const chosen = game.presets?.find((p) => p.name === preset) ?? null;
    const { context, missing } = fromPreset(name.trim() || chosen?.name || game.name, game, chosen, data.items);
    await data.putItem(context);
    if (missing.length) alert(`Not loaded yet, so left out: ${missing.join(", ")}`);
    onMade(context);
  };
  return (
    <div className="form">
      <h2>New</h2>
      <label className="stack">
        <span className="sub">Game</span>
        <select value={game.key} onChange={(e) => (setGameKey(e.target.value), setPreset(games.find((g) => g.key === e.target.value)?.presets?.[0]?.name ?? ""))}>
          {games.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
        </select>
      </label>
      {(game.presets ?? []).length > 0 && (
        <label className="stack">
          <span className="sub">Start from (the game's presets: Settings → Configuration)</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {(game.presets ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          {game.presets?.find((p) => p.name === preset)?.about && <span className="sub">{game.presets.find((p) => p.name === preset)!.about}</span>}
        </label>
      )}
      <input className="filter" placeholder="Name (e.g. Friday night)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="buttons">
        <button className="primary" onClick={make}>Start</button>
      </div>
    </div>
  );
}
