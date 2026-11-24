// One unit in a list: its size, the General, its options and command, what it costs and why.
import { useEffect, useState } from "react";
import type { Context, Game, Roster } from "../../../items/items";
import { removeUnit, toggleChoice, updateUnit, viewRoster, type ChoiceGroup } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import { setLeaveGuard, type Nav } from "../../App";
import { headingFor } from "../../../items/race-dimensions";
import { NumberBox } from "../../number-box";

export function RosterUnitScreen({ data, nav, rosterKey, unitId }: { data: AppData; nav: Nav; rosterKey: string; unitId: string }) {
  const [, setChanged] = useState(0);
  // A required choice not made: can't leave (hide or grey out), or leave after a warning (allow).
  useEffect(() => {
    setLeaveGuard(() => {
      const r = data.items.find((i): i is Roster => i.kind === "roster" && i.key === rosterKey);
      const v = r ? viewRoster(r, data.items) : null;
      const unit = v?.units.find((x) => x.rosterUnit.id === unitId);
      const missing = unit?.issues.filter((i) => i.message.includes(": choose one of")).map((i) => i.message) ?? [];
      return missing.length ? { message: missing.join("\n"), mayLeave: v!.limitMode === "allow" } : null;
    });
    return () => setLeaveGuard(null);
  }, [data, rosterKey, unitId]);
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
  // Choices shown under one heading where they belong together: take-it-or-not choices of the same
  // kind (Drilled, Veteran) sit under one "Special rules" (owner, 23 Nov).
  const shown = u.choices.filter((g) => !(g.where.startsWith("slot:") && !ru.slots.includes(g.where.slice(5))) && (g.choices.length > 0 || g.allowance || g.full));
  const blocks: ChoiceGroup[][] = [];
  for (const g of shown) {
    const last = blocks[blocks.length - 1]?.[0];
    const together = last && last.where === g.where && !last.oneOf && !g.oneOf && !last.required && !g.required;
    if (together) blocks[blocks.length - 1].push(g);
    else blocks.push([g]);
  }
  // An allowance: what's spent, the items taken (tap to see), and Choose… for the picker.
  const AllowanceBlock = ({ group }: { group: ChoiceGroup }) => {
    const a = group.allowance!;
    const prefix = `item:${group.where}|${a.name}|`;
    const taken = ru.picks.filter((p) => p.startsWith(prefix)).map((p) => data.items.find((i) => i.key === p.slice(prefix.length)));
    const spent = taken.reduce((n, i) => n + (i?.kind === "magic-item" ? i.cost?.points ?? 0 : 0), 0);
    return (
      <div className="allowance">
        <span className="sub">{a.text}{taken.length ? ` · ${spent} spent` : ""}</span>
        {taken.map((i, n) => i && (
          <div key={n} className="choice">
            <button className="link" onClick={() => nav.open({ name: "item", key: i.key })}>{i.name}</button>
            <span className="sub">{i.kind === "magic-item" ? `${i.type} · ${i.cost?.points ?? 0}` : ""}</span>
          </div>
        ))}
        <button className="link" onClick={() => nav.open({ name: "roster-items", roster: roster.key, unit: ru.id, where: group.where, allowance: a.name })}>Choose…</button>
      </div>
    );
  };
  const context = data.items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const heading = (column: string) => headingFor(data.items.find((i): i is Game => i.kind === "game" && i.shortName === context?.game), column);
  const isOn = (group: string, pick: string) => (group === "command" ? ru.slots.includes(pick.split("|")[1]) : ru.picks.includes(pick));

  return (
    <section className="card">
      <h1>{ru.title ?? u.taken?.name ?? ru.unit}</h1>
      {ru.title && <p className="sub">{u.taken?.name}</p>}
      <p className="sub">
        {u.category} · <b>{u.points} pts</b>
      </p>
      {/* The unit as a character of its own: a name, an icon, a description (owner, 24 Nov). Kept on the
          list for now; a world record can hold them later, with the list pointing at it. */}
      <details className="list-settings" open={!!(ru.title || ru.description)}>
        <summary>Name, icon and description</summary>
        <div className="persona">
          <div className="icon-spot" title="Images come later">
            <span className="sub">Icon</span>
            <span className="sub">(images coming)</span>
          </div>
          <input className="filter" placeholder="Its name, e.g. Marcus Aurelius" defaultValue={ru.title ?? ""} onBlur={(e) => e.target.value.trim() !== (ru.title ?? "") && save(updateUnit(roster, ru.id, { title: e.target.value.trim() || undefined }))} />
        </div>
        <textarea className="note" placeholder="Description: who they are, their story" defaultValue={ru.description ?? ""} onBlur={(e) => e.target.value.trim() !== (ru.description ?? "") && save(updateUnit(roster, ru.id, { description: e.target.value.trim() || undefined }))} />
      </details>
      {/* What's wrong with this unit: its own issues and the list's issues that name it. */}
      {problems.length > 0 && <ul className="plain problems">{problems.map((m, n) => <li key={n}>{m}</li>)}</ul>}
      {u.limits.length > 0 && (
        <div className="field block">
          <span className="label">{heading("Unit Limit")}</span>
          <ul className="plain">{u.limits.map((l, i) => <li key={i} className="sub">{l}</li>)}</ul>
        </div>
      )}

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
            <input
              type="checkbox"
              checked={ru.general}
              disabled={!ru.general && !!view.generalFull && view.limitMode !== "allow"}
              onChange={() => save(updateUnit(roster, ru.id, { general: !ru.general }))}
            />{" "}
            this character is the General
          </label>
          {!ru.general && view.generalFull && <span className="full-note"> {view.limitMode === "allow" ? "⚠ " : ""}{view.generalFull}{view.limitMode === "allow" ? "" : ": take it off the other first"}</span>}
        </div>
      )}

      {blocks.map((block, bi) => {
        const first = block[0];
        return (
          <div key={bi} className="field block">
            <span className="label">
              {first.title}
              {first.oneOf && <span className="sub">{first.title ? " · c" : "C"}hoose one{first.required ? " (required)" : ""}</span>}
              {!first.oneOf && first.required && <span className="sub"> · required</span>}
            </span>
            {block.map((g) => (
              <div key={u.choices.indexOf(g)}>
                {g.choices.map((c) => (
                  <label key={c.pick} className={"choice" + (c.blocked && !isOn(g.where, c.pick) ? " unavailable" : "")}>
                    <input
                      type={g.oneOf ? "radio" : "checkbox"}
                      name={`${ru.id}-${u.choices.indexOf(g)}`}
                      checked={isOn(g.where, c.pick)}
                      disabled={!!c.blocked && !isOn(g.where, c.pick)}
                      onClick={() => save(toggleChoice(roster, ru.id, g, c))}
                      onChange={() => {}}
                    />
                    <span>{c.label}</span>
                    <span className="sub">{c.costText}</span>
                  </label>
                ))}
                {g.allowance && <AllowanceBlock group={g} />}
                {g.full && <span className="full-note">{g.full}</span>}
              </div>
            ))}
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
        <span className="label">{heading("Cost")}</span>
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
