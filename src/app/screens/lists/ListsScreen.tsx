// Lists: your pick-up games, and starting a new one. A pick-up game is a context with no world
// (rebuild build log, 22 Nov); its world field is never shown here.
import { useState } from "react";
import type { Context, Game, Roster } from "../../../items/items";
import { newContext } from "../../../context/context";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { SwipeRow } from "../../swipe";

export function ListsScreen({ data, nav }: { data: AppData; nav: Nav }) {
  const [, setChanged] = useState(0);
  const games = data.items.filter((i): i is Game => i.kind === "game");
  const pickups = data.items.filter((i): i is Context => i.kind === "context" && !i.world);
  const rostersIn = (c: Context) => data.items.filter((i): i is Roster => i.kind === "roster" && i.context === c.key);

  const remove = async (c: Context) => {
    const rosters = rostersIn(c);
    if (!confirm(`Remove ${c.name}${rosters.length ? ` and its ${rosters.length} list${rosters.length > 1 ? "s" : ""}` : ""}?`)) return;
    await data.removeItems([c.key, ...rosters.map((r) => r.key)]);
    setChanged((n) => n + 1);
  };

  return (
    <section>
      <h1>Pick-up games</h1>
      {games.length === 0 && <p className="hint">No game loaded yet: add one in Settings → Library first.</p>}
      <ul className="list">
        {pickups.map((c) => (
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
      {games.length > 0 && <NewPickupGame data={data} games={games} onMade={(c) => nav.open({ name: "pickup", key: c.key })} />}
    </section>
  );
}

function NewPickupGame({ data, games, onMade }: { data: AppData; games: Game[]; onMade: (c: Context) => void }) {
  const [name, setName] = useState("");
  const [game, setGame] = useState(games[0].key);
  const make = async () => {
    const g = games.find((x) => x.key === game)!;
    const context = newContext(name.trim() || "Pick-up game", g, data.items);
    await data.putItem(context);
    onMade(context);
  };
  return (
    <div className="form">
      <h2>New pick-up game</h2>
      <input className="filter" placeholder="Name (e.g. Friday night)" value={name} onChange={(e) => setName(e.target.value)} />
      {games.length > 1 && (
        <select value={game} onChange={(e) => setGame(e.target.value)}>
          {games.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
        </select>
      )}
      <div className="buttons">
        <button className="primary" onClick={make}>Start</button>
      </div>
    </div>
  );
}
