// Choosing which tree a world's screens show (owner, 25 Nov: several trees, by province, by
// terrain …): the one chosen last, remembered while the app is open, else the main tree.
// Design: design/world-structure.md §3 ("different views are different link kinds").
import type { AppData } from "../../app-data";
import { treeKinds } from "../../../world/places";
import { networkKinds } from "../../../world/network";
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

// Several trees: choose which one to show (owner, 25 Nov: by province, by terrain …).
export function TreePicker({ data, world, tree, onChoose, withAll, withNetworks }: { data: AppData; world: string; tree: string | undefined; onChoose: (key: string) => void; withAll?: boolean; withNetworks?: boolean }) {
  const trees = treeKinds(data.items, world);
  const networks = withNetworks ? networkKinds(data.items, world) : [];
  if (trees.length + networks.length < (withAll ? 1 : 2)) return null;
  return (
    <label className="tree-picker">
      <span className="sub">{networks.length ? "Show" : "Tree"}</span>
      <select value={tree ?? ""} onChange={(e) => onChoose(e.target.value)}>
        {networks.length > 0 ? (
          <>
            <optgroup label="Trees">{trees.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</optgroup>
            <optgroup label="Networks">{networks.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</optgroup>
          </>
        ) : (
          trees.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)
        )}
        {withAll && <option value={ALL}>All, by kind</option>}
      </select>
    </label>
  );
}
