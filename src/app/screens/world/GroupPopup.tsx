// "Group / move into" for several selected items, on the map and the Diagram (owner, 26 Nov:
// "selecting two or more means they can be grouped either to a new group or an existing one,
// including 'move into' as an option, where if an existing one is part of the selection then
// suggesting that first"). Core: src/world/bulk.ts.
import { useState } from "react";
import type { Item, Thing } from "../../../items/items";
import type { Brings } from "../../../world/groups";
import { ScopePicks } from "./scope-picks";
import { groupSelected, moveSelectedInto, newGroupOf, suggestions, type BulkResult } from "../../../world/bulk";
import { groupsIn } from "../../../world/groups";
import { firstTree, pathOf } from "../../../world/places";
import { refusal } from "../../../world/kinds";
import { linkKindsIn, thingsIn, worldOf } from "../../../world/world";
import type { AppData } from "../../app-data";

export function GroupPopup({ data, world, selected, tree, apply, onClose }: { data: AppData; world: string; selected: string[]; tree?: string; apply: (items: Item[]) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(new Map<string, Brings>()); // what each container or group brings
  const treeKey = tree ?? firstTree(data.items, world);
  const treeName = linkKindsIn(data.items, world).find((k) => k.key === treeKey)?.name ?? "the tree";
  const suggest = suggestions(data.items, world, selected, treeKey);
  const others = (target: string) => selected.filter((k) => k !== target).length;
  const groups = groupsIn(data.items, world).filter((g) => !selected.includes(g.key));
  const containers = thingsIn(data.items, world)
    .filter((t) => !selected.includes(t.key) && (!treeKey || !refusal(data.items, world, treeKey, "to", t.key)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const run = async (result: BulkResult) => {
    if (result.done > 0) await apply(result.items);
    if (result.problems.length) alert(`${result.done} done. Not done:\n${result.problems.join("\n")}`);
    onClose();
  };
  const label = (t: Thing) => pathOf(data.items, world, t.key, treeKey).map((p) => p.name).join(" › ");

  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>{selected.length} selected</h2>
        <ScopePicks data={data} world={world} keys={selected} scopes={scopes} onChange={setScopes} />
        {(suggest.groups.length > 0 || suggest.containers.length > 0) && (
          <div className="buttons">
            {suggest.groups.map((g) => (
              <button key={`g${g.key}`} className="primary" onClick={() => run(groupSelected(data.items, world, selected, g.key, undefined, scopes))}>Put the other {others(g.key)} in the group {g.name}</button>
            ))}
            {suggest.containers.map((c) => (
              <button key={`c${c.key}`} className="primary" onClick={() => run(moveSelectedInto(data.items, world, selected, c.key, treeKey))}>Move the other {others(c.key)} into {c.name}</button>
            ))}
          </div>
        )}
        <h2>A new group</h2>
        <div className="inline-add">
          <input className="filter" placeholder="Name (e.g. The gun road)" value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={!name.trim()} onClick={() => run(newGroupOf(data.items, world, selected, name, undefined, scopes))}>Make</button>
        </div>
        {groups.length > 0 && (
          <label className="stack">
            <span className="sub">Into a group (they stay where they are, and keep their other groups)</span>
            <select value="" onChange={(e) => e.target.value && run(groupSelected(data.items, world, selected, e.target.value, undefined, scopes))}>
              <option value="">Choose a group…</option>
              {groups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
            </select>
          </label>
        )}
        <label className="stack">
          <span className="sub">Move into (in "{treeName}": one container at a time)</span>
          <select value="" onChange={(e) => e.target.value && run(moveSelectedInto(data.items, world, selected, e.target.value, treeKey))}>
            <option value="">Choose a container…</option>
            {containers.map((t) => <option key={t.key} value={t.key}>{label(t)}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
