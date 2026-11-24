// Search as you type, within a scope (owner, 24 Nov): it opens on where you are (the library, one
// package, your lists, one set-up, one list) and can be widened. Library scopes search names, keys,
// aliases and types; list scopes search list names, your names for units, unit names and sections.
// Logic: src/library/search.ts.
import { useState } from "react";
import { searchIn, type Scope, type Target } from "../../library/search";
import type { AppData } from "../app-data";
import type { Nav, Screen } from "../App";
import { ViewMenu } from "../filter-menu";
import { nameOf } from "./GameScreen";

let lastText = ""; // what was typed, kept when you come back

// The scopes offered from where you started, narrowest first.
function scopesFrom(start: Scope, data: AppData): { id: string; label: string; scope: Scope }[] {
  const all: { id: string; label: string; scope: Scope }[] = [];
  const roster = start.kind === "roster" ? data.items.find((i) => i.key === start.key) : undefined;
  if (start.kind === "roster") all.push({ id: "roster", label: `This list: ${nameOf(start.key, data.items)}`, scope: start });
  const contextKey = start.kind === "context" ? start.key : roster?.kind === "roster" ? roster.context : undefined;
  if (contextKey) all.push({ id: "context", label: `This set-up: ${nameOf(contextKey, data.items)}`, scope: { kind: "context", key: contextKey } });
  if (start.kind !== "library" && start.kind !== "package" && start.kind !== "game") all.push({ id: "lists", label: "All my lists", scope: { kind: "lists" } });
  if (start.kind === "package") all.push({ id: "package", label: `This package: ${nameOf(start.key, data.items)}`, scope: start });
  // A game's own library (TOW): from the game's page, or a package or item of it.
  const gameShort = start.kind === "game" ? start.key : start.kind === "package" ? start.key.split(".")[0] : undefined;
  const game = gameShort ? data.items.find((i) => i.kind === "game" && i.shortName === gameShort) : undefined;
  if (game) all.push({ id: "game", label: `This game: ${game.name}`, scope: { kind: "game", key: gameShort! } });
  all.push({ id: "library", label: "The whole library", scope: { kind: "library" } });
  if (start.kind === "library" || start.kind === "package" || start.kind === "game") all.push({ id: "lists", label: "All my lists", scope: { kind: "lists" } });
  return all;
}

export function SearchScreen({ data, nav, start }: { data: AppData; nav: Nav; start: Scope }) {
  const [text, setText] = useState(lastText);
  const scopes = scopesFrom(start, data);
  const [scopeId, setScopeId] = useState(scopes[0].id);
  const scope = (scopes.find((s) => s.id === scopeId) ?? scopes[0]).scope;
  const results = searchIn(data.items, text, scope);
  return (
    <section>
      <ViewMenu options={scopes.map((s) => ({ id: s.id, label: s.label }))} value={scopeId} onChange={setScopeId} />
      <div className="search-row">
        <input className="filter search-box" type="text" autoFocus placeholder={scope.kind === "library" || scope.kind === "package" || scope.kind === "game" ? "Names, keys, aliases, types" : "List, unit and section names"} value={text} onChange={(e) => setText((lastText = e.target.value))} />
        {text && <button className="search-clear" aria-label="Clear the search" onClick={() => setText((lastText = ""))}>×</button>}
      </div>
      {text.trim() !== "" && results.length === 0 && <p className="hint">Nothing found here.</p>}
      <ul className="plain search-results">
        {results.map((h, i) => (
          <li key={i}>
            <button className={"link" + (h.stub ? " stub-link" : "")} onClick={() => nav.open(screenFor(h.target))}>{h.label}</button>
            <span className="sub"> {h.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function screenFor(t: Target): Screen {
  if (t.kind === "roster-unit") return { name: "roster-unit", roster: t.key, unit: t.unit };
  if (t.kind === "pickup") return { name: "pickup", key: t.key };
  if (t.kind === "roster") return { name: "roster", key: t.key };
  if (t.kind === "package") return { name: "package", key: t.key };
  if (t.kind === "game") return { name: "game", key: t.key };
  return { name: "item", key: t.key };
}
