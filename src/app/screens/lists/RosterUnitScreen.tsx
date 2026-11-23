// One unit in a list: its size, the General, its options and command, what it costs and why.
import { useState } from "react";
import type { Roster } from "../../../items/items";
import { removeUnit, toggleChoice, updateUnit, viewRoster } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { NumberBox } from "../../number-box";

export function RosterUnitScreen({ data, nav, rosterKey, unitId }: { data: AppData; nav: Nav; rosterKey: string; unitId: string }) {
  const [, setChanged] = useState(0);
  const roster = data.items.find((i): i is Roster => i.kind === "roster" && i.key === rosterKey);
  const view = roster ? viewRoster(roster, data.items) : null;
  const u = view?.units.find((x) => x.rosterUnit.id === unitId);
  if (!roster || !view || !u) return <p>Not in the list any more.</p>;
  const save = async (next: Roster) => {
    await data.putItem(next);
    setChanged((n) => n + 1);
  };
  const ru = u.rosterUnit;
  const size = u.taken?.size;
  const fixedSize = size && size.min !== null && size.min === size.max;
  const problems = [...new Set([...u.issues, ...view.issues.filter((i) => i.units.includes(ru.id))].map((i) => i.message))];
  const isOn = (group: string, pick: string) => (group === "command" ? ru.slots.includes(pick.split("|")[1]) : ru.picks.includes(pick));

  return (
    <section className="card">
      <h1>{u.taken?.name ?? ru.unit}</h1>
      <p className="sub">
        {u.category} · <b>{u.points} pts</b>
      </p>
      {/* What's wrong with this unit: its own issues and the list's issues that name it. */}
      {problems.length > 0 && <ul className="plain problems">{problems.map((m, n) => <li key={n}>{m}</li>)}</ul>}

      {!fixedSize && (
        <div className="field">
          <span className="label">Models</span>
          <span className="stepper">
            <button onClick={() => save(updateUnit(roster, ru.id, { size: Math.max(1, ru.size - 1) }))}>−</button>
            <NumberBox value={ru.size} min={1} onChange={(size) => save(updateUnit(roster, ru.id, { size }))} />
            <button onClick={() => save(updateUnit(roster, ru.id, { size: ru.size + 1 }))}>+</button>
          </span>
        </div>
      )}
      {u.taken?.character && (
        <div className="field">
          <span className="label">General</span>
          <label>
            <input type="checkbox" checked={ru.general} onChange={() => save(updateUnit(roster, ru.id, { general: !ru.general }))} /> this character is the General
          </label>
        </div>
      )}

      {u.choices.map((g, gi) => {
        if (g.where.startsWith("slot:") && !ru.slots.includes(g.where.slice(5))) return null;
        if (g.choices.length === 0 && !g.allowance && !g.full) return null;
        return (
          <div key={gi} className="field block">
            <span className="label">
              {g.title}
              {g.oneOf && <span className="sub">{g.title ? " · c" : "C"}hoose one{g.required ? " (required)" : ""}</span>}
              {!g.oneOf && g.required && <span className="sub"> · required</span>}
            </span>
            {g.choices.map((c) => (
              <label key={c.pick} className="choice">
                <input type={g.oneOf ? "radio" : "checkbox"} name={`${ru.id}-${gi}`} checked={isOn(g.where, c.pick)} onClick={() => save(toggleChoice(roster, ru.id, g, c))} onChange={() => {}} />
                <span>{c.label}</span>
                <span className="sub">{c.costText}</span>
              </label>
            ))}
            {g.allowance && <span className="sub">{g.allowance}</span>}
            {g.full && <span className="full-note">{g.full}</span>}
          </div>
        );
      })}

      {u.taken && u.taken.patched.length > 0 && (
        <div className="field block">
          <span className="label">Patches</span>
          <ul className="plain">{u.taken.patched.map((p, i) => <li key={i} className="sub">{p}</li>)}</ul>
        </div>
      )}
      <div className="field block">
        <span className="label">Cost</span>
        <ul className="plain">{u.breakdown.map((b, i) => <li key={i}>{b}</li>)}</ul>
      </div>

      <div className="buttons">
        <button onClick={() => nav.back()}>Done</button>
        <button
          className="danger"
          onClick={async () => {
            await save(removeUnit(roster, ru.id));
            nav.back();
          }}
        >
          Remove from list
        </button>
      </div>
    </section>
  );
}
