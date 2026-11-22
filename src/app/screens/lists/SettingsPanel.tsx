// The game's settings as dropdowns, for a pick-up game or one list: each shows its value and where
// that comes from (this list, this game, a package, the game's default), and can be changed to one of
// the game's choices, written by hand, or put back to what it would otherwise be.
import { useState } from "react";
import type { Context, Game, Item, Roster } from "../../../items/items";
import { settingValue } from "../../../settings/settings";

type Props = { game: Game | undefined; items: Item[]; context: Context; roster?: Roster; onChange: (settings: Record<string, string>) => void };

export function SettingsPanel({ game, items, context, roster, onChange }: Props) {
  const [writing, setWriting] = useState<string | null>(null);
  const settings = game?.settings ?? [];
  if (settings.length === 0) return <p className="sub">This game has no settings.</p>;
  const own = (roster ? roster.settings : context.settings) ?? {};
  const set = (name: string, value: string | null) => {
    const next = { ...own };
    if (value === null) delete next[name];
    else next[name] = value;
    onChange(next);
  };

  return (
    <div className="settings">
      {settings.map((s) => {
        const found = settingValue(s.name, game, items, context, roster);
        const isOwn = own[s.name] !== undefined;
        const label = Object.entries(s.choices).find(([, v]) => v === found?.value)?.[0];
        return (
          <div key={s.name} className="field block">
            <span className="label">{s.name}</span>
            {s.about && <span className="sub">{s.about}</span>}
            <select
              value={label ? found!.value : "__written"}
              onChange={(e) => {
                if (e.target.value === "__write") setWriting(s.name);
                else if (e.target.value === "__inherit") set(s.name, null);
                else set(s.name, e.target.value);
              }}
            >
              {Object.entries(s.choices).map(([l, v]) => (
                <option key={l} value={v}>{l}</option>
              ))}
              {!label && <option value="__written">{found?.value}</option>}
              <option value="__write">Write my own…</option>
              {isOwn && <option value="__inherit">Use what the {roster ? "game" : "packages"} say</option>}
            </select>
            <span className="sub">
              {found?.value} · from {found?.from}
            </span>
            {writing === s.name && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get("value") ?? "").trim();
                  if (v) set(s.name, v);
                  setWriting(null);
                }}
              >
                <input name="value" className="filter" defaultValue={found?.value} autoFocus />
                <button className="primary" type="submit">Set</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
