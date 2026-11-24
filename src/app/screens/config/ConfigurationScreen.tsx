// Settings → Configuration: each game's configuration, in sections that fold (owner, 23 Nov: "move
// to tabs in settings, there's a lot starting to go on"). Saved onto the game; downloads with it.
import { useState } from "react";
import type { Game } from "../../../items/items";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { GameConfig } from "./GameConfig";

let lastGame = ""; // the game tab last open

// One tab per game (owner, 24 Nov: "config for tow should be under tow, as a tab").
export function ConfigurationScreen({ data, nav }: { data: AppData; nav: Nav }) {
  const [, setChanged] = useState(0);
  const games = data.items.filter((i): i is Game => i.kind === "game");
  const [open, setOpen] = useState(lastGame);
  if (games.length === 0) return <p className="hint">Load a game in Library first.</p>;
  const game = games.find((g) => g.key === open) ?? games[0];
  return (
    <section>
      <nav className="segments">
        {games.map((g) => (
          <button key={g.key} className={g.key === game.key ? "on" : ""} onClick={() => setOpen((lastGame = g.key))}>
            {g.shortName.toUpperCase()}
          </button>
        ))}
      </nav>
      <h2>{game.name}</h2>
      <p className="sub">What this game starts with and offers. Changes download with the game.</p>
      <GameConfig key={game.key} data={data} nav={nav} game={game} onSaved={() => setChanged((n) => n + 1)} />
    </section>
  );
}
