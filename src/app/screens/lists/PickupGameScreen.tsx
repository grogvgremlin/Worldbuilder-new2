// A context in Pick-up, in the order you set one up (owner, 22 Nov): the game; its books, FAQs (a
// book brings its latest FAQ) and house rules; settings, folded — Basic (composition) and Advanced
// (the game's settings); then start a list, and the lists already in it. Under each package, its
// patches, each switched on or off on its own (owner, 23 Nov).
import { useState } from "react";
import type { ArmyList, Context, Item, Package, Patch, Roster } from "../../../items/items";
import { patchesInPlay } from "../../../rules/patches";
import { chooseComposition, copyContext, groupFor, moveInContext, offered, readContext, removeFromContext, switchOff, switchOn, type Group, type PackageInContext } from "../../../context/context";
import { isCompositionSet } from "../../../library/package-types";
import { armyListsIn, newRoster, viewRoster } from "../../../lists/roster";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";
import { SwipeRow } from "../../swipe";
import { SettingsPanel } from "./SettingsPanel";
import { presetFromContext, withPreset } from "../../../context/game-config";

export function PickupGameScreen({ data, nav, contextKey }: { data: AppData; nav: Nav; contextKey: string }) {
  const [, setChanged] = useState(0);
  const context = data.items.find((i): i is Context => i.kind === "context" && i.key === contextKey);
  if (!context) return <p>Not on the device any more.</p>;
  const byKey = new Map(data.items.map((i) => [i.key, i]));
  const view = readContext(context, data.items);
  const offer = offered(context, data.items);
  const save = async (next: Context) => {
    await data.putItem(next);
    setChanged((n) => n + 1);
  };
  const groupOf = (p: PackageInContext): Group | "core" => {
    if (p.how === "core") return "core";
    const pkg = byKey.get(p.key);
    return pkg?.kind === "package" ? groupFor(pkg, byKey) : "books";
  };
  const rosters = data.items.filter((i): i is Roster => i.kind === "roster" && i.context === context.key);
  const shown = view.packages.filter((p) => !(byKey.get(p.key) as Package | undefined)?.stubsFor);
  const listedOn = (key: string) => [...context.books, ...context.faqs, ...context.house, ...context.campaign].some((p) => p.package === key);
  const compositionSets = data.items.filter((i): i is Package => i.kind === "package" && i.game === context.game && isCompositionSet(i, byKey));
  const chosenComposition = context.composition.filter((c) => c.on).map((c) => c.package);

  // A package's patches, each switched on or off here on its own (the package stays on).
  const patches = patchesInPlay(context, data.items);
  const whyOff = new Map(patches.skipped.map((x) => [x.patch.key, x.why]));
  const toggleCard = (key: string) => {
    const off = context.off ?? [];
    return save({ ...context, off: off.includes(key) ? off.filter((k) => k !== key) : [...off, key] });
  };
  const patchesOf = (pkg: Package | undefined) => {
    const list = (pkg?.members ?? []).map((k) => byKey.get(k)).filter((i): i is Patch => i?.kind === "patch");
    if (list.length === 0) return null;
    return (
      <details className="cards-in">
        <summary className="sub">{list.length === 1 ? "1 patch" : `${list.length} patches`}{list.some((x) => whyOff.has(x.key)) ? `, ${list.filter((x) => whyOff.has(x.key)).length} off` : ""}</summary>
        <ul className="plain">
          {list.map((patch) => (
            <li key={patch.key}>
              <label>
                <input type="checkbox" checked={!(context.off ?? []).includes(patch.key)} onChange={() => toggleCard(patch.key)} />
                <span>
                  <button className="link" onClick={(e) => (e.preventDefault(), nav.open({ name: "item", key: patch.key }))}>{patch.name}</button>
                  {whyOff.has(patch.key) && whyOff.get(patch.key) !== "switched off here" && <span className="sub"> · {whyOff.get(patch.key)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    );
  };

  const section = (group: Group, title: string) => {
    const here = shown.filter((p) => groupOf(p) === group);
    const listed = context[group].map((p) => p.package);
    const more = offer.get(group) ?? [];
    if (here.length === 0 && more.length === 0) return null;
    return (
      <div>
        <h2>{title}</h2>
        <ul className="plain rules-on">
          {here.map((p) => (
            <li key={p.key}>
              {listedOn(p.key) ? (
                <div className="ordered">
                  <label>
                    <input type="checkbox" checked={p.on} onChange={() => save(p.on ? switchOff(context, p.key, data.items) : switchOn(context, p.key, data.items))} />
                    <span>
                      {p.name} {describe(byKey.get(p.key), byKey)}
                    </span>
                  </label>
                  {listed.length > 1 && (
                    <span className="arrows">
                      <button aria-label="Earlier" disabled={listed[0] === p.key} onClick={() => save(moveInContext(context, p.key, -1))}>↑</button>
                      <button aria-label="Later" disabled={listed[listed.length - 1] === p.key} onClick={() => save(moveInContext(context, p.key, 1))}>↓</button>
                    </span>
                  )}
                </div>
              ) : (
                <span>
                  {p.name} <span className="sub">needed by {p.neededBy.join(", ")}</span>
                </span>
              )}
              {p.on && patchesOf(byKey.get(p.key) as Package | undefined)}
            </li>
          ))}
        </ul>
        {more.length > 0 && (
          <div className="buttons">
            {more.map((p) => (
              <button key={p.key} onClick={() => save(switchOn(context, p.key, data.items))}>+ {p.name}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section>
      <input className="title-input" value={context.name} onChange={(e) => save({ ...context, name: e.target.value })} aria-label="Name" />
      <p className="sub">
        {view.game?.name ?? context.game} · {shown.filter((p) => p.how === "core").map((p) => p.name).join(", ")} always on
      </p>

      {section("books", "Books")}
      {section("faqs", "FAQs")}
      {section("house", "House rules")}
      <details className="list-settings">
        <summary>Applied order</summary>
        <p className="sub">Packages apply in this order; where two disagree, the later one wins. Groups keep their order (core, books, FAQs, house rules); use ↑ ↓ to order within a group. What a package needs comes before it.</p>
        <ol className="applied">
          {view.packages.filter((p) => p.on && !(byKey.get(p.key) as Package | undefined)?.stubsFor).map((p) => (
            <li key={p.key}>
              {p.name} <span className="sub">{p.how === "core" ? "core" : p.how === "needed" ? `needed by ${p.neededBy.join(", ")}` : groupOf(p)}</span>
            </li>
          ))}
        </ol>
      </details>
      {[...view.warnings, ...patches.problems].length > 0 && <ul className="plain problems">{[...view.warnings, ...patches.problems].map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {[...context.books, ...context.faqs, ...context.house].some((p) => !p.on) && (
        <p className="sub">
          Switched off here:{" "}
          {[...context.books, ...context.faqs, ...context.house].filter((p) => !p.on).map((p) => (
            <button key={p.package} className="link" onClick={() => save(removeFromContext(context, p.package))}>
              {byKey.get(p.package)?.name ?? p.package} (forget){" "}
            </button>
          ))}
        </p>
      )}

      <details className="list-settings">
        <summary>Settings</summary>
        <h3>Basic</h3>
        <div className="field block settings">
          <span className="label">Composition</span>
          <select
            value={chosenComposition.length === 1 ? chosenComposition[0] : chosenComposition.length === 0 ? "" : "__several"}
            onChange={(e) => e.target.value !== "__several" && save(chooseComposition(context, e.target.value ? [e.target.value] : []))}
          >
            {compositionSets.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            <option value="">None: only the army lists' own limits</option>
            {chosenComposition.length > 1 && <option value="__several">Several</option>}
          </select>
        </div>
        <h3>Advanced</h3>
        <SettingsPanel game={view.game} items={data.items} context={context} onChange={(settings) => save({ ...context, settings })} />
      </details>

      <h2>Lists</h2>
      <NewList data={data} context={context} lists={armyListsIn(context, data.items)} onMade={(r) => nav.open({ name: "roster", key: r.key })} />
      <ul className="list">
        {rosters.map((r) => {
          const rv = viewRoster(r, data.items);
          return (
            <li key={r.key}>
              <SwipeRow
                action="Remove"
                onAction={async () => {
                  if (!confirm(`Remove ${r.name}?`)) return;
                  await data.removeItems([r.key]);
                  setChanged((n) => n + 1);
                }}
              >
                <button onClick={() => nav.open({ name: "roster", key: r.key })}>
                  <span className="title">{r.name}</span>
                  <span className={"sub" + (rv.issues.length ? " warn" : "")}>
                    {rv.armyList?.name} · {rv.total}/{r.target}
                    {rv.issues.length ? ` · ${rv.issues.length} to fix` : ""}
                  </span>
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>

      <div className="buttons">
        <button
          onClick={async () => {
            const copy = copyContext(context, data.items);
            await data.putItem(copy);
            nav.open({ name: "pickup", key: copy.key });
          }}
        >
          Copy this set-up
        </button>
        <button
          onClick={async () => {
            const name = prompt("Name for the preset", context.name);
            if (!name || !view.game) return;
            const game = view.game;
            const at = (game.presets ?? []).findIndex((p) => p.name === name);
            if (at >= 0 && !confirm(`Replace the preset ${name}?`)) return;
            await data.putItem(withPreset(game, at >= 0 ? at : (game.presets ?? []).length, presetFromContext(context, data.items, name)));
            alert(`Saved: “${name}” is now offered under Start from.`);
          }}
        >
          Save as a preset
        </button>
      </div>
    </section>
  );
}

// "(corrects Forces of Fantasy, 1.2)" for an FAQ; "(part of Forces of Fantasy)" for an army book.
function describe(item: Item | undefined, byKey: Map<string, Item>): string {
  if (item?.kind !== "package") return "";
  if (item.corrects) return `(corrects ${byKey.get(item.corrects)?.name ?? item.corrects}${item.version ? `, ${item.version}` : ""})`;
  if (item.partOf) return `(in ${byKey.get(item.partOf)?.name ?? item.partOf})`;
  return "";
}

// Army list first, then a name and the points; Start opens the list.
function NewList({ data, context, lists, onMade }: { data: AppData; context: Context; lists: ArmyList[]; onMade: (r: Roster) => void }) {
  const [list, setList] = useState(lists[0]?.key ?? "");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(1000);
  if (lists.length === 0) return <p className="hint">Switch on an army book above to start a list.</p>;
  const make = async () => {
    const armyList = lists.find((l) => l.key === list) ?? lists[0];
    const roster = newRoster(name.trim() || `${armyList.name} ${target}`, context, armyList, target, data.items);
    await data.putItem(roster);
    onMade(roster);
  };
  return (
    <div className="form">
      <select value={list} onChange={(e) => setList(e.target.value)}>
        {lists.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
      </select>
      <div className="row">
        <input className="filter" placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row">
        <label className="points">
          <input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} /> pts
        </label>
        <button className="primary" onClick={make}>Start the list</button>
      </div>
    </div>
  );
}
