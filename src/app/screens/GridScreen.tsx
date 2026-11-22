// A package's items of one kind as a grid: the same rows and columns as its workbook tab.
// Tap a row to open the item's card. The filter matches any cell.
import { useState } from "react";
import type { Package } from "../../items/items";
import { TABS, type TabId } from "../../packages/package-sheets";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { gridFor } from "../grid-rows";
import { downloadTabCsv } from "../../library/upload";
import { saveFile } from "../save-file";

export function GridScreen({ data, nav, packageKey, tab }: { data: AppData; nav: Nav; packageKey: string; tab: TabId }) {
  const [filter, setFilter] = useState("");
  const pkg = data.items.find((i): i is Package => i.key === packageKey && i.kind === "package");
  if (!pkg) return <p>Not on the device any more.</p>;
  const grid = gridFor(pkg, tab, new Map(data.items.map((i) => [i.key, i])));
  const f = filter.trim().toLowerCase();
  const keys = new Set(grid.rows.filter((r) => !f || Object.values(r.row).some((c) => c.toLowerCase().includes(f))).map((r) => r.key));
  const rows = grid.rows.filter((r) => keys.has(r.key));
  return (
    <section>
      <h1>
        {TABS.find((t) => t.id === tab)!.title} <span className="sub">· {pkg.name}</span>
      </h1>
      <input className="filter" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>{grid.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.first ? "first" : "sub-row"} onClick={() => nav.open({ name: "item", key: r.key })}>
                {grid.columns.map((c) => <td key={c}>{r.row[c]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub">{keys.size} of {new Set(grid.rows.map((r) => r.key)).size}</p>
      {!pkg.stubsFor && (
        <div className="buttons">
          <button onClick={() => saveFile(downloadTabCsv(data.items, pkg, tab))}>Download this tab (CSV)</button>
        </div>
      )}
    </section>
  );
}
