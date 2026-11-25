// Choosing which tree a world's screens show (owner, 25 Nov: several trees, by province, by
// terrain …): the one chosen last, remembered while the app is open, else the main tree.
// Design: design/world-structure.md §3 ("different views are different link kinds").
import type { AppData } from "../../app-data";
import { treeKinds } from "../../../world/places";
import { worldOf } from "../../../world/world";
import { useRemembered } from "./remembered";

// The tree a world's screens follow: the one chosen last (remembered), else the main tree.
export function useChosenTree(data: AppData, world: string): [string | undefined, (key: string) => void] {
  const trees = treeKinds(data.items, world);
  const [chosen, setChosen] = useRemembered(`${world}|tree`, trees[0]?.key ?? "");
  return [trees.find((k) => k.key === chosen)?.key ?? trees[0]?.key, setChosen];
}

// Several trees: choose which one to show (owner, 25 Nov: by province, by terrain …).
export function TreePicker({ data, world, tree, onChoose }: { data: AppData; world: string; tree: string | undefined; onChoose: (key: string) => void }) {
  const trees = treeKinds(data.items, world);
  if (trees.length < 2) return null;
  const main = worldOf(data.items, world)?.tree;
  return (
    <label className="tree-picker">
      <span className="sub">Tree</span>
      <select value={tree ?? ""} onChange={(e) => onChoose(e.target.value)}>
        {trees.map((k) => <option key={k.key} value={k.key}>{k.name}{k.key === main ? " (main)" : ""}</option>)}
      </select>
    </label>
  );
}
