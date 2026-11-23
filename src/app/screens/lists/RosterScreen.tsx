// A list being built: points against the target, each category against its limits, what needs
// fixing, and the units by section with Add. Building never blocks: issues are shown, not refused.
import { useState } from "react";
import type { Roster, Unit } from "../../../items/items";
import { addUnit, removeUnit, viewRoster } from "../../../lists/roster";
import { inReach } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { SwipeRow } from "../../swipe";
import { NumberBox } from "../../number-box";
import { SettingsPanel } from "./SettingsPanel";
import type { Context, Game } from "../../../items/items";

export function RosterScreen({ data, nav, rosterKey }: { data: AppData; nav: Nav; rosterKey: string }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [openWhy, setOpenWhy] = useState<string | null>(null); // the section whose reasons are showing
  const [, setChanged] = useState(0);
  const roster = data.items.find((i): i is Roster => i.kind === "roster" && i.key === rosterKey);
  if (!roster) return <p>Not on the device any more.</p>;
  const view = viewRoster(roster, data.items);
  const save = async (next: Roster) => {
    await data.putItem(next);
    setChanged((n) => n + 1);
  };
  const context = data.items.find((i) => i.key === roster.context);
  const reach = context?.kind === "context" ? inReach(context, data.items) : [];
  const entries = view.armyList?.entries ?? [];
  const sections = [...new Set(entries.map((e) => e.category))];
  const flagged = new Set(view.issues.flatMap((i) => i.units));

  return (
    <section>
      <h1>{roster.name}</h1>
      <p className="sub">{view.armyList?.name}</p>
      <div className={"total" + (view.total > roster.target ? " over" : "")}>
        <b>{view.total}</b> of{" "}
        <NumberBox value={roster.target} min={0} onChange={(target) => save({ ...roster, target })} /> pts
      </div>
      <ul className="plain categories">
        {view.categories.map((c) => (
          <li key={c.category} className={c.ok && !view.issues.some((i) => i.categories?.includes(c.category)) ? "ok" : "bad"}>
            {c.category} {c.points} <span className="sub">{c.limit}</span>
          </li>
        ))}
      </ul>
      {context?.kind === "context" && (
        <details className="list-settings">
          <summary>List settings</summary>
          <SettingsPanel
            game={data.items.find((i): i is Game => i.kind === "game" && i.shortName === (context as Context).game)}
            items={data.items}
            context={context as Context}
            roster={roster}
            onChange={(settings) => save({ ...roster, settings })}
          />
        </details>
      )}
      {view.issues.length > 0 && (
        <details className="issues" open={view.issues.length <= 3}>
          <summary>{view.issues.length} to fix</summary>
          <ul className="plain problems">{view.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
        </details>
      )}

      {sections.map((section) => {
        const inSection = view.units.filter((u) => u.category === section);
        const points = inSection.reduce((n, u) => n + u.points, 0);
        // Red when the list falls short here: its own limit, or a rule about this category's units.
        const limit = view.categories.find((c) => c.category === section);
        const about = [...(limit && !limit.ok ? [`${section}: ${points} pts, ${limit.limit}`] : []), ...view.issues.filter((i) => i.categories?.includes(section)).map((i) => i.message)];
        const bad = about.length > 0;
        return (
          <div key={section}>
            {/* Red when the list falls short here; tap the heading for why (owner: keep it uncrowded). */}
            <h2 className={bad ? "bad fold" : ""} onClick={() => bad && setOpenWhy(openWhy === section ? null : section)}>
              {section} <span className="sub">{points} pts{limit ? ` · ${limit.limit}` : ""}</span>
              {bad && <span className="why-mark"> ⓘ</span>}
            </h2>
            {bad && openWhy === section && <p className="section-issues">{about.join(" · ")}</p>}
            <ul className="list">
              {inSection.map((u) => (
                <li key={u.rosterUnit.id}>
                  <SwipeRow action="Remove" onAction={() => save(removeUnit(roster, u.rosterUnit.id))}>
                    <button onClick={() => nav.open({ name: "roster-unit", roster: roster.key, unit: u.rosterUnit.id })}>
                      <span className="title">
                        {flagged.has(u.rosterUnit.id) && <span className="warn">⚠ </span>}
                        {u.taken?.name ?? u.rosterUnit.unit}
                        {u.rosterUnit.size > 1 && <span className="sub"> ×{u.rosterUnit.size}</span>}
                        {u.rosterUnit.general && <span className="sub"> · General</span>}
                      </span>
                      <span className="sub">{u.points} pts</span>
                    </button>
                  </SwipeRow>
                </li>
              ))}
            </ul>
            {adding === section ? (
              <ul className="plain add-list">
                {entries
                  .filter((e) => e.category === section)
                  .map((e) => reach.find((i): i is Unit => i.kind === "unit" && i.key === e.unit))
                  .filter((u): u is Unit => u !== undefined && !view.full[u.key])
                  .map((u) => (
                    <li key={u.key}>
                      <button
                        className="link"
                        onClick={async () => {
                          const next = addUnit(roster, u, data.items);
                          await save(next);
                          setAdding(null);
                          nav.open({ name: "roster-unit", roster: roster.key, unit: next.units[next.units.length - 1].id });
                        }}
                      >
                        + {u.name}
                      </button>
                    </li>
                  ))}
                {entries
                  .filter((e) => e.category === section && view.full[e.unit])
                  .map((e) => (
                    <li key={e.unit} className="full-note">{view.full[e.unit]}</li>
                  ))}
                <li>
                  <button className="link sub" onClick={() => setAdding(null)}>Close</button>
                </li>
              </ul>
            ) : (
              <button className="add" onClick={() => setAdding(section)}>+ Add to {section}</button>
            )}
          </div>
        );
      })}
    </section>
  );
}
