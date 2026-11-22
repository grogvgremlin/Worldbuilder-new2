// A package: what it holds (by tab), what it needs (found and stated), what needs it; downloads.
import type { Package } from "../../items/items";
import { downloadFullYaml, downloadPackageSheetYaml, downloadPackageWorkbook } from "../../library/upload";
import { foundNeeds } from "../../packages/resolve";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { tabCounts } from "../grid-rows";
import { saveFile } from "../save-file";
import { nameOf } from "./GameScreen";

export function PackageScreen({ data, nav, packageKey }: { data: AppData; nav: Nav; packageKey: string }) {
  const pkg = data.items.find((i): i is Package => i.key === packageKey && i.kind === "package");
  if (!pkg) return <p>Not on the device any more.</p>;
  const byKey = new Map(data.items.map((i) => [i.key, i]));
  const found = foundNeeds(pkg, data.items);
  const neededBy = data.items.filter((i): i is Package => i.kind === "package" && i.key !== pkg.key && (i.needsStated.includes(pkg.key) || foundNeeds(i, data.items).has(pkg.key)));
  const members = pkg.members.map((k) => byKey.get(k)).filter((i) => i !== undefined);
  return (
    <section>
      <h1>{pkg.name}</h1>
      <p className="sub">
        {pkg.stubsFor ? `Names in ${nameOf(pkg.stubsFor, data.items)} that match nothing yet` : `Layer: ${pkg.layer}`}
        {pkg.partOf && <> · part of {nameOf(pkg.partOf, data.items)}</>}
        {pkg.reference && <> · {pkg.reference.source}</>}
      </p>
      {pkg.notes && <p className="hint">{pkg.notes}</p>}

      <h2>Holds</h2>
      <ul className="list">
        {tabCounts(pkg, byKey).map((c) => (
          <li key={c.tab}>
            <button onClick={() => nav.open({ name: "grid", packageKey: pkg.key, tab: c.tab })}>
              <span className="title">{c.title}</span>
              <span className="sub">{c.count}</span>
            </button>
          </li>
        ))}
        {members.filter((i) => i.kind === "army-list").map((list) => (
          <li key={list.key}>
            <button onClick={() => nav.open({ name: "item", key: list.key })}>
              <span className="title">Army list</span>
              <span className="sub">{list.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <h2>Needs</h2>
      {found.size === 0 && pkg.needsStated.length === 0 && <p className="sub">Nothing else.</p>}
      <ul className="plain">
        {pkg.needsStated.map((k) => (
          <li key={k}>
            <b>{nameOf(k, data.items)}</b> <span className="sub">stated</span>
          </li>
        ))}
        {[...found].map(([k, names]) => (
          <li key={k}>
            <b>{nameOf(k, data.items)}</b> <span className="sub">found: {names.join(", ")}</span>
          </li>
        ))}
      </ul>
      {neededBy.length > 0 && (
        <>
          <h2>Needed by</h2>
          <ul className="plain">{neededBy.map((p) => <li key={p.key}>{p.name}</li>)}</ul>
        </>
      )}

      {!pkg.stubsFor && (
        <>
          <h2>Download</h2>
          <div className="buttons">
            <button onClick={() => saveFile(downloadPackageWorkbook(data.items, pkg))}>Workbook (.xlsx)</button>
            <button onClick={() => saveFile(downloadPackageSheetYaml(data.items, pkg))}>Sheet YAML</button>
            <button onClick={() => saveFile(downloadFullYaml([pkg, ...members], `${pkg.key}-stored.yaml`))}>Stored form (YAML)</button>
          </div>
        </>
      )}
    </section>
  );
}
