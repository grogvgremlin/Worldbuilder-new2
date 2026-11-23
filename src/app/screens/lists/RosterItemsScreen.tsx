// Choosing magic items for one allowance on one unit: the items it offers, by type, each with its
// cost; one that can't be taken says why (over the budget, not for this bearer, a rule about magic
// items). Tap to take or take off. Logic: src/lists/roster.ts (itemChoices), src/lists/magic-items.ts.
import { useState } from "react";
import type { Roster } from "../../../items/items";
import { itemChoices, toggleItem, viewRoster } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

type Props = { data: AppData; nav: Nav; rosterKey: string; unitId: string; where: string; allowance: string };

export function RosterItemsScreen({ data, nav, rosterKey, unitId, where, allowance }: Props) {
  const [, setChanged] = useState(0);
  const roster = data.items.find((i): i is Roster => i.kind === "roster" && i.key === rosterKey);
  if (!roster) return <p>Not on the device any more.</p>;
  const unit = viewRoster(roster, data.items).units.find((u) => u.rosterUnit.id === unitId);
  const group = unit?.choices.find((g) => g.where === where && g.allowance?.name === allowance);
  const choices = itemChoices(roster, data.items, unitId, where, allowance);
  const types = [...new Set(choices.map((c) => c.item.type))];
  const save = async (next: Roster) => {
    await data.putItem(next);
    setChanged((n) => n + 1);
  };
  return (
    <section className="card">
      <h1>{allowance}</h1>
      <p className="sub">
        {unit?.taken?.name}
        {where.startsWith("slot:") ? ` · ${where.slice(5)}` : ""} · {group?.allowance?.text}
      </p>
      {choices.length === 0 && <p className="hint">No magic items of these types are in the books switched on.</p>}
      {types.map((type) => (
        <div key={type} className="field block">
          <span className="label">{type}</span>
          {choices.filter((c) => c.item.type === type).map((c) => (
            <label key={c.item.key} className={"choice" + (c.why ? " unavailable" : "")}>
              <input type="checkbox" checked={c.picked} disabled={!!c.why} onChange={() => save(toggleItem(roster, unitId, where, allowance, c.item.key))} />
              <span>
                {c.item.name}
                {c.item.extremelyCommon && <span className="sub"> · extremely common</span>}
                {c.why && <span className="full-note"> · {c.why}</span>}
              </span>
              <span className="sub">{c.item.cost?.points ?? 0}</span>
            </label>
          ))}
        </div>
      ))}
      <div className="buttons">
        <button onClick={() => nav.back()}>Done</button>
      </div>
    </section>
  );
}
