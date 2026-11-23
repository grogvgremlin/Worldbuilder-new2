// A package's items of one kind as a grid: the same rows and columns as its workbook tab.
// Tap a row to open the item's card. The filter matches any cell. Rows fold by type (or race, or
// category); races can show one stat as a tree × rank table.
import { useState } from "react";
import type { Package } from "../../items/items";
import { TABS, type TabId } from "../../packages/package-sheets";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { gridFor, type GridRow } from "../grid-rows";
import { STATS } from "../../packages/sheet-tabs";
import { downloadTabCsv } from "../../library/upload";
import { saveFile } from "../save-file";

// Rows fold by a column that sorts them (owner, 23 Nov): magic items and equipment by type, races by
// race, rules by type, units by category. The value is taken from an item's first row.
const GROUP_BY: Partial<Record<TabId, string>> = { "magic items": "Type", equipment: "Type", races: "Race", rules: "Type", units: "Tier" };
const openGroups = new Set<string>(); // kept while the app is open

export function GridScreen({ data, nav, packageKey, tab }: { data: AppData; nav: Nav; packageKey: string; tab: TabId }) {
  const [filter, setFilter] = useState("");
  const [stat, setStat] = useState(""); // races: one stat as a tree × rank table, or "" for every stat
  const [, setToggled] = useState(0);
  const pkg = data.items.find((i): i is Package => i.key === packageKey && i.kind === "package");
  if (!pkg) return <p>Not on the device any more.</p>;
  const grid = gridFor(pkg, tab, new Map(data.items.map((i) => [i.key, i])));
  const f = filter.trim().toLowerCase();
  const keys = new Set(grid.rows.filter((r) => !f || Object.values(r.row).some((c) => c.toLowerCase().includes(f))).map((r) => r.key));
  const rows = grid.rows.filter((r) => keys.has(r.key));
  const column = GROUP_BY[tab];
  const groupOf = new Map(grid.rows.filter((r) => r.first).map((r) => [r.key, (column && r.row[column]) || "—"]));
  const groups = column ? [...new Set(rows.map((r) => groupOf.get(r.key)!))] : [""];
  const stats = tab === "races" ? STATS.filter((s) => grid.columns.includes(s)) : [];

  const table = (list: GridRow[]) => (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>{grid.columns.filter((c) => c !== column).map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i} className={r.first ? "first" : "sub-row"} onClick={() => nav.open({ name: "item", key: r.key })}>
              {grid.columns.filter((c) => c !== column).map((c) => <td key={c}>{r.row[c]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // One stat for one race: trees down the side, ranks across (blank tree = Core, blank rank = Base).
  const matrix = (list: GridRow[]) => {
    const trees = [...new Set(list.map((r) => r.row["Tree"] || "Core"))];
    const ranks = [...new Set(list.map((r) => r.row["Rank"] || "Base"))];
    const cell = (tree: string, rank: string) => list.find((r) => (r.row["Tree"] || "Core") === tree && (r.row["Rank"] || "Base") === rank);
    return (
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{stat}</th>
              {ranks.map((rank) => <th key={rank}>{rank}</th>)}
            </tr>
          </thead>
          <tbody>
            {trees.map((tree) => (
              <tr key={tree}>
                <th>{tree}</th>
                {ranks.map((rank) => {
                  const r = cell(tree, rank);
                  return <td key={rank} onClick={() => r && nav.open({ name: "item", key: r.key })}>{r ? r.row[stat] : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section>
      <h1>
        {TABS.find((t) => t.id === tab)!.title} <span className="sub">· {pkg.name}</span>
      </h1>
      <input className="filter" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {stats.length > 0 && (
        <label className="stack">
          <span className="sub">Show</span>
          <select value={stat} onChange={(e) => setStat(e.target.value)}>
            <option value="">Every stat (tree · rank down the side)</option>
            {stats.map((s) => <option key={s} value={s}>{s} only: trees × ranks</option>)}
          </select>
        </label>
      )}
      {groups.map((g) => {
        const list = rows.filter((r) => !column || groupOf.get(r.key) === g);
        const body = stat ? matrix(list) : table(list);
        if (!column) return <div key="all">{body}</div>;
        const id = `${pkg.key}|${tab}|${g}`;
        return (
          <details
            key={`${g}|${f !== ""}`}
            className="browse-group"
            open={f !== "" || groups.length === 1 || openGroups.has(id)}
            onToggle={(e) => ((e.target as HTMLDetailsElement).open ? openGroups.add(id) : openGroups.delete(id), setToggled((n) => n + 1))}
          >
            <summary>
              <h2>{g} <span className="sub">{new Set(list.map((r) => r.key)).size}</span></h2>
            </summary>
            {body}
          </details>
        );
      })}
      <p className="sub">{keys.size} of {new Set(grid.rows.map((r) => r.key)).size}</p>
      {!pkg.stubsFor && (
        <div className="buttons">
          <button onClick={() => saveFile(downloadTabCsv(data.items, pkg, tab))}>Download this tab (CSV)</button>
        </div>
      )}
    </section>
  );
}
