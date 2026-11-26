// When grouping several items, what each container or group brings: alone, its contents in one tree,
// or its members (owner, 26 Nov: "when grouping allow a scope to be set, such that a container brings
// its items with it … specify the scope if it's ambiguous"). Only items with a choice are listed.
import type { Brings } from "../../../world/groups";
import { broughtOptions } from "../../../world/groups";
import { treeKinds } from "../../../world/places";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";

export function ScopePicks({ data, world, keys, scopes, onChange }: { data: AppData; world: string; keys: string[]; scopes: Map<string, Brings>; onChange: (next: Map<string, Brings>) => void }) {
  const treesOf = treeKinds(data.items, world).map((k) => ({ key: k.key, name: k.name }));
  const rows = thingsIn(data.items, world)
    .filter((t) => keys.includes(t.key))
    .map((t) => ({ thing: t, options: broughtOptions(data.items, world, t.key, treesOf) }))
    .filter((r) => r.options.length > 0);
  if (rows.length === 0) return null;
  const set = (key: string, value: string) => {
    const next = new Map(scopes);
    const option = rows.find((r) => r.thing.key === key)!.options.find((o) => o.label === value);
    if (option) next.set(key, option.scope);
    else next.delete(key);
    onChange(next);
  };
  const current = (key: string, options: { scope: Brings; label: string }[]) => {
    const scope = scopes.get(key);
    return options.find((o) => JSON.stringify(o.scope) === JSON.stringify(scope))?.label ?? "";
  };
  return (
    <div className="scope-picks">
      <div className="sub">What each brings into the group (it follows later changes):</div>
      {rows.map((r) => (
        <label key={r.thing.key} className="tree-row">
          <span className="tree-label">{r.thing.name}</span>
          <select value={current(r.thing.key, r.options)} onChange={(e) => set(r.thing.key, e.target.value)}>
            <option value="">alone</option>
            {r.options.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
