// A list in game view (owner, 24 Nov; after the Old World Builder's): each unit's stat lines, its
// equipment and command (each model with its own kit), its special rules (tap one for its précis, ↗
// for its card), magic items, page and your note. "Show" picks what's there; "Print" lays it out for
// paper, each rule written out. Turned sideways, units sit two abreast. Battle tracking comes with the
// Battle tool. Logic: src/lists/game-view.ts.
import { useState } from "react";
import type { Context, Game, Roster } from "../../../items/items";
import { armyReference, gameUnits, type GameUnit, type Ref, type ReferenceSection } from "../../../lists/game-view";
import type { RosterView } from "../../../lists/roster";
import { writeStat } from "../../../notation/values";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { ShowMenu } from "../../filter-menu";
import { ItemPopup } from "../ItemPopup";
import { headingFor } from "../../../items/race-dimensions";

const FILTERS = [
  { id: "points", label: "Points" },
  { id: "stats", label: "Stats" },
  { id: "kit", label: "Equipment and command" },
  { id: "rules", label: "Special rules" },
  { id: "items", label: "Magic items" },
  { id: "pages", label: "Pages" },
  { id: "description", label: "Description" },
  { id: "notes", label: "Notes" },
  // Battle: its own group, more to come in it (owner, 24 Nov), each part switched on or off.
  { id: "battle", label: "Battle" },
  { id: "battle-notes", label: "Battle notes", parent: "battle" },
  { id: "print", label: "Print: rules written out" },
];

// What's shown is kept on this device (a convenience: lost, it's simply the default again).
function loadFilters(): Set<string> {
  try {
    const saved = localStorage.getItem("game-view-filters");
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(["points", "stats", "kit", "rules", "items", "description"]);
}
function saveFilters(f: Set<string>) {
  try {
    localStorage.setItem("game-view-filters", JSON.stringify([...f]));
  } catch {}
}

let lastTab: "units" | "reference" = "units"; // kept while the app is open

export function GameView({ data, nav, view, save }: { data: AppData; nav: Nav; view: RosterView; save: (r: Roster) => void }) {
  const [on, setOn] = useState<Set<string>>(loadFilters);
  const [popup, setPopup] = useState<string | null>(null);
  const [tab, setTab] = useState<"units" | "reference">(lastTab);
  const roster = view.roster;
  const units = gameUnits(view, data.items);
  const toggle = (f: string) => {
    const next = new Set(on);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    saveFilters(next);
    setOn(next);
  };
  const context = data.items.find((i): i is Context => i.kind === "context" && i.key === roster.context);
  const game = data.items.find((i): i is Game => i.kind === "game" && i.shortName === context?.game);
  const stats = game?.statlines.model ?? [];
  const sectionPoints = (section: string) => units.filter((u) => u.category === section).reduce((n, u) => n + u.points, 0);
  const sections = [...new Set((view.armyList?.entries ?? []).map((e) => e.category))].filter((c) => units.some((u) => u.category === c));

  return (
    <div className={"game-view" + (on.has("print") ? " print" : "")}>
      <nav className="segments">
        <button className={tab === "units" ? "on" : ""} onClick={() => setTab((lastTab = "units"))}>Units</button>
        <button className={tab === "reference" ? "on" : ""} onClick={() => setTab((lastTab = "reference"))}>Rules reference</button>
      </nav>
      {tab === "reference" ? (
        <Reference sections={armyReference(units, data.items, game)} openItem={setPopup} />
      ) : (
      <>
      <ShowMenu options={FILTERS} on={on} onToggle={toggle} />
      {on.has("description") && roster.description && (
        <details className="game-section" open>
          <summary>Description</summary>
          <p className="description">{roster.description}</p>
        </details>
      )}
      {sections.map((section) => (
        <details key={section} className="browse-group" open>
          <summary>
            <h2>
              {section} {on.has("points") && <span className="sub">{sectionPoints(section)} pts · {roster.target ? Math.round((sectionPoints(section) * 100) / roster.target) : 0}%</span>}
            </h2>
          </summary>
          <div className="game-units">
            {units.filter((u) => u.category === section).map((u) => (
              <UnitCard
                key={u.id}
                u={u}
                stats={stats}
                on={on}
                openItem={setPopup}
                heading={(column) => headingFor(game, column)}
                onNote={(note) => save({ ...roster, units: roster.units.map((x) => (x.id === u.id ? { ...x, note: note || undefined } : x)) })}
                onBattleNote={(battleNote) => save({ ...roster, units: roster.units.map((x) => (x.id === u.id ? { ...x, battleNote: battleNote || undefined } : x)) })}
              />
            ))}
          </div>
        </details>
      ))}
      </>
      )}
      {popup && <ItemPopup data={data} nav={nav} itemKey={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

type CardProps = {
  u: GameUnit;
  stats: string[];
  on: Set<string>;
  openItem: (key: string) => void;
  onNote: (note: string) => void;
  onBattleNote: (note: string) => void;
  heading: (column: string) => string;
};

function UnitCard({ u, stats, on, openItem, onNote, onBattleNote, heading }: CardProps) {
  const [openRule, setOpenRule] = useState<number | null>(null);
  const print = on.has("print");
  const cols = stats.filter((s) => u.lines.some((l) => l.stats[s] !== undefined));
  const named = true; // every row named; the unit's own as "Unit" (owner, 24 Nov)
  // Anything with a card opens it, over the list.
  const link = (name: string, key: string | undefined) => (key ? <button className="link" onClick={() => openItem(key)}>{name}</button> : <span>{name}</span>);
  const refs = (list: Ref[]) => list.map((r, i) => <span key={i}>{i > 0 && ", "}{link(r.name, r.key)}</span>);

  return (
    <details className="game-unit" open>
      {/* The owner's name for the unit first ("Marcus Aurelius"), then what it is; tap to fold the card. */}
      <summary className="game-unit-summary">
        {u.title && <div className="game-unit-title">{u.title}</div>}
        <div className="game-unit-head">
          <span className={u.title ? "" : "title"}>
            {u.name}
            {u.size > 1 && <span className="sub"> ×{u.size}</span>}
            {u.general && <span className="sub"> · General</span>}
          </span>
          {on.has("points") && <span className="sub">{u.points} pts</span>}
        </div>
      </summary>

      {on.has("stats") && cols.length > 0 && (
        <div className="grid-wrap fit">
          <table className="stats">
            <thead>
              <tr>
                {named && <th></th>}
                {cols.map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {u.lines.map((l, i) => (
                <tr key={i}>
                  {named && <th>{l.name || "Unit"}</th>}
                  {cols.map((s) => <td key={s}>{writeStat(l.stats[s])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {on.has("kit") && (u.equipment.length > 0 || u.command.length > 0) && (
        <details className="game-section" open>
          <summary>{heading("Equipment")}{u.command.length > 0 ? ` and ${heading("Slots").toLowerCase()}` : ""}</summary>
          {u.equipment.length > 0 && <p><span className="sub">{heading("Equipment")}: </span>{refs(u.equipment)}</p>}
          {u.command.map((c) => (
            <p key={c.section}>
              <span className="sub">{c.section}: </span>
              {c.models.map((m, i) => (
                <span key={m.name}>
                  {i > 0 && ", "}
                  {link(m.name, m.key)}
                  {m.kit.length > 0 && <span className="sub"> · {refs(m.kit)}</span>}
                </span>
              ))}
            </p>
          ))}
        </details>
      )}

      {on.has("items") && u.items.length > 0 && (
        <p>
          <span className="sub">{heading("Magic Items")}: </span>
          {u.items.map((i, n) => (
            <span key={n}>
              {n > 0 && ", "}
              {link(i.name, i.key)}
              <span className="sub"> ({i.type})</span>
            </span>
          ))}
        </p>
      )}

      {on.has("rules") && u.rules.length > 0 && (
        <details className="game-section" open>
          <summary>{heading("Rules")}</summary>
          {print ? (
            <ul className="print-rules">
              {u.rules.map((r, n) => (
                <li key={n}>
                  <b>{r.name}</b>: {r.text ?? "not entered yet"}
                </li>
              ))}
            </ul>
          ) : (
            // Tapping a rule opens its précis on a row of its own; the rules after it move below.
            <div className="game-rules">
              {u.rules.flatMap((r, n) => {
                const parts = [
                  <span key={`r${n}`} className="rule-item">
                    <button className={"link rule-link" + (openRule === n ? " on" : "")} onClick={() => setOpenRule(openRule === n ? null : n)}>
                      {r.name}
                    </button>
                    {n < u.rules.length - 1 && ","}
                  </span>,
                ];
                if (openRule === n)
                  parts.push(
                    <div key={`t${n}`} className="rule-text">
                      {r.text ?? "Not entered yet."}
                      {r.key && <button className="link" aria-label="Open the rule's card" onClick={() => openItem(r.key!)}> ↗</button>}
                    </div>,
                  );
                return parts;
              })}
            </div>
          )}
        </details>
      )}

      {on.has("pages") && u.ref && (
        <p className="sub">
          Ref: {link(u.ref.source.name, u.ref.source.key)}
          {u.ref.page && <> [{link(`p. ${u.ref.page}`, u.ref.source.key)}]</>}
        </p>
      )}
      {on.has("description") && u.description && (
        <details className="game-section" open>
          <summary>Description</summary>
          <p className="description">{u.description}</p>
        </details>
      )}
      {on.has("notes") && (
        <details className="game-section" open>
          <summary>Notes</summary>
          <textarea className="note" placeholder="Your notes" defaultValue={u.note ?? ""} onBlur={(e) => e.target.value !== (u.note ?? "") && onNote(e.target.value.trim())} />
        </details>
      )}
      {on.has("battle") && on.has("battle-notes") && (
        <details className="game-section" open>
          <summary>Battle notes</summary>
          <textarea className="note" placeholder="Notes for this battle" defaultValue={u.battleNote ?? ""} onBlur={(e) => e.target.value !== (u.battleNote ?? "") && onBattleNote(e.target.value.trim())} />
        </details>
      )}
    </details>
  );
}

// The rules reference: every rule, piece of kit and magic item in the list, written out, in sections
// (Special rules, Equipment, Magic items) and types that fold. Tap a name for its card.
function Reference({ sections, openItem }: { sections: ReferenceSection[]; openItem: (key: string) => void }) {
  if (sections.length === 0) return <p className="hint">Nothing in the list yet.</p>;
  return (
    <>
      {sections.map((section) => (
        <details key={section.title} className="browse-group" open>
          <summary>
            <h2>{section.title}</h2>
          </summary>
          {section.groups.map((g) => (
            <details key={g.type} className="game-section reference-group" open>
              <summary>{g.type}</summary>
              {g.entries.map((e) => (
                <div key={e.key ?? e.name} className="reference-entry">
                  {e.key ? <button className="link reference-name" onClick={() => openItem(e.key!)}>{e.name}</button> : <b>{e.name}</b>}
                  {e.facts.length > 0 && <span className="sub"> · {e.facts.join(" · ")}</span>}
                  {e.text && <p>{e.text}</p>}
                </div>
              ))}
            </details>
          ))}
        </details>
      ))}
    </>
  );
}
