// Settings → Configuration: each game's configuration, in sections that fold (owner, 23 Nov: "move
// to tabs in settings, there's a lot starting to go on"). Saved onto the game; downloads with it.
import { useState } from "react";
import type { Game } from "../../../items/items";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { GameConfig } from "./GameConfig";

export function ConfigurationScreen({ data, nav }: { data: AppData; nav: Nav }) {
  const [, setChanged] = useState(0);
  const games = data.items.filter((i): i is Game => i.kind === "game");
  if (games.length === 0) return <p className="hint">Load a game in Library first.</p>;
  return (
    <section>
      <p className="sub">What each game starts with and offers. Changes download with the game.</p>
      {games.map((game) => (
        <div key={game.key}>
          <h2>{game.name}</h2>
          <GameConfig data={data} nav={nav} game={game} onSaved={() => setChanged((n) => n + 1)} />
        </div>
      ))}
    </section>
  );
}
