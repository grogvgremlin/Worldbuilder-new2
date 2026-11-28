// Choosing which tree a world's screens show (owner, 25 Nov: several trees, by province, by
// terrain …): the one chosen last, remembered while the app is open, else the main tree.
// Design: design/world-structure.md §3 ("different views are different link kinds").
import type { AppData } from "../../app-data";
import { treeKinds } from "../../../world/places";
import { groupsViewKey, networkKinds, networksViewKey } from "../../../world/network";
import { groupsIn } from "../../../world/groups";
import { useState } from "react";
import { worldOf } from "../../../world/world";
import { useRemembered } from "./remembered";

// The tree a world's screens follow: the one chosen last (remembered), else the main tree. The
// Diagram can also show a network (a connection link kind: owner, 27 Nov); elsewhere a network
// chosen there reads as the first tree.
export function useChosenTree(data: AppData, world: string, withNetworks = false): [string | undefined, (key: string) => void] {
  const trees = [...treeKinds(data.items, world), ...(withNetworks ? networkKinds(data.items, world) : [])];
  const [chosen, setChosen] = useRemembered(`${world}|tree`, trees[0]?.key ?? "");
  return [trees.find((k) => k.key === chosen)?.key ?? trees[0]?.key, setChosen];
}

// "All" in the picker on Items: every item, by kind and flavour, instead of one tree (owner, 26 Nov).
export const ALL = "(all)";

// Choosing what a view shows (owner, 27 Nov: "the type, then which one"): on the Diagram, a tree or
// a network (a connection link kind), then which; elsewhere, which tree. `always` shows it even with
// one tree, so the screen says what it's showing.
export function TreePicker({ data, world, tree, onChoose, withNetworks, always, onOpen }: { data: AppData; world: string; tree: string | undefined; onChoose: (key: string) => void; withNetworks?: boolean; always?: boolean; onOpen?: (key: string) => void }) {
  const trees = treeKinds(data.items, world);
  const networks = withNetworks ? networkKinds(data.items, world) : [];
  if (trees.length + networks.length < (always ? 1 : 2)) return null;
  const isNetwork = networks.some((k) => k.key === tree);
  const list = isNetwork ? networks : trees;
  return (
    <span className="tree-picker">
      {networks.length > 0 && (
        <select value={isNetwork ? "network" : "tree"} onChange={(e) => onChoose((e.target.value === "network" ? networks[0] : trees[0])?.key ?? "")}>
          <option value="tree">Tree</option>
          <option value="network">Network</option>
        </select>
      )}
      {networks.length === 0 && <span className="sub">Tree</span>}
      <select value={tree ?? ""} onChange={(e) => onChoose(e.target.value)}>
        {list.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
      </select>
      {/* Its settings card (owner, 28 Nov). */}
      {onOpen && tree && <button className="tool" aria-label="Its settings" title="Its settings" onClick={() => onOpen(tree)}>⚙</button>}
    </span>
  );
}

// --- The Diagram's view (owner, 28 Nov): a tree (one), or networks or groups, several at once ---------
export type ViewType = "tree" | "network" | "group";
export type DiagramView = { type: ViewType; tree: string | undefined; networks: string[]; groups: string[] };

export function useDiagramView(data: AppData, world: string): [DiagramView, (v: Partial<DiagramView>) => void] {
  const [tree, setTree] = useChosenTree(data, world);
  const networks = networkKinds(data.items, world);
  const groups = groupsIn(data.items, world);
  const [type, setType] = useRemembered<ViewType>(`${world}|view-type`, "tree");
  const [nets, setNets] = useRemembered<string[]>(`${world}|view-networks`, networks[0] ? [networks[0].key] : []);
  const [grps, setGrps] = useRemembered<string[]>(`${world}|view-groups`, groups[0] ? [groups[0].key] : []);
  const view: DiagramView = {
    type: type === "network" && networks.length === 0 ? "tree" : type === "group" && groups.length === 0 ? "tree" : type,
    tree,
    networks: nets.filter((k) => networks.some((n) => n.key === k)),
    groups: grps.filter((k) => groups.some((g) => g.key === k)),
  };
  const set = (v: Partial<DiagramView>) => {
    if (v.type) setType(v.type);
    if (v.tree) setTree(v.tree);
    if (v.networks) setNets(v.networks);
    if (v.groups) setGrps(v.groups);
  };
  return [view, set];
}

// The key the view is laid out and kept under.
export function viewKeyOf(view: DiagramView): string | undefined {
  if (view.type === "network") return view.networks.length ? networksViewKey(view.networks) : undefined;
  if (view.type === "group") return view.groups.length ? groupsViewKey(view.groups) : undefined;
  return view.tree;
}

export function ViewPicker({ data, world, view, onChange, onOpen }: { data: AppData; world: string; view: DiagramView; onChange: (v: Partial<DiagramView>) => void; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const trees = treeKinds(data.items, world);
  const networks = networkKinds(data.items, world);
  const groups = groupsIn(data.items, world);
  const list = view.type === "network" ? networks.map((k) => ({ key: k.key, name: k.name })) : groups.map((g) => ({ key: g.key, name: g.name }));
  const chosen = view.type === "network" ? view.networks : view.groups;
  const toggle = (key: string) => {
    const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
    onChange(view.type === "network" ? { networks: next } : { groups: next });
  };
  const summary = chosen.length === 0 ? "choose…" : chosen.length === 1 ? list.find((c) => c.key === chosen[0])?.name ?? "1" : `${chosen.length} shown`;
  return (
    <span className="tree-picker">
      <select value={view.type} onChange={(e) => onChange({ type: e.target.value as ViewType })}>
        <option value="tree">Tree</option>
        {networks.length > 0 && <option value="network">Network</option>}
        {groups.length > 0 && <option value="group">Group</option>}
      </select>
      {view.type === "tree" ? (
        <>
          <select value={view.tree ?? ""} onChange={(e) => onChange({ tree: e.target.value })}>
            {trees.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
          </select>
          {view.tree && <button className="tool" aria-label="Its settings" title="Its settings" onClick={() => onOpen(view.tree!)}>⚙</button>}
        </>
      ) : (
        <span className="areas-menu">
          <button className="tool" onClick={() => setOpen(!open)}>{summary} ▾</button>
          {open && (
            <>
              <div className="menu-catcher" onClick={() => setOpen(false)} />
              <div className="filter-panel view-choices">
                <div className="sub">{view.type === "network" ? "Network types shown together" : "Groups shown together"}</div>
                {list.map((c) => (
                  <div key={c.key} className="view-choice">
                    <label className="choice"><input type="checkbox" checked={chosen.includes(c.key)} onChange={() => toggle(c.key)} /> {c.name}</label>
                    <button className="link" aria-label="Open" onClick={() => onOpen(c.key)}>⚙</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </span>
      )}
    </span>
  );
}
