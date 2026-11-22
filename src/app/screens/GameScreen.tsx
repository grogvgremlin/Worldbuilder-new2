// A game: its packages in sections by type (Core rules, Army books, Books, FAQs, House rules,
// Campaign, Not entered yet), or as the books nest; a view picks one section; sections and
// branches fold. Downloads for the whole game.
import { useState } from "react";
import type { Game, Item, Package } from "../../items/items";
import { PACKAGE_TYPES, packageType, type PackageType } from "../../library/package-types";
import { downloadFullYaml, downloadGameSheetYaml, downloadGameWorkbook, downloadGameZip, gameItems } from "../../library/upload";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { saveFile } from "../save-file";
import { BROWSE_KINDS } from "./BrowseScreen";
import { SwipeRow } from "../swipe";
import { needsOf } from "../../context/context";
import { GameConfig } from "./config/GameConfig";

type View = "sections" | "nesting" | PackageType;

export function GameScreen({ data, nav, gameKey }: { data: AppData; nav: Nav; gameKey: string }) {
  const [view, setView] = useState<View>("nesting");
  // "Not entered yet" starts folded: it grows with every book that names things not yet entered.
  const [folded, setFolded] = useState<Set<string>>(new Set(["stubs"]));
  const [, setChanged] = useState(0);
  const game = data.items.find((i): i is Game => i.key === gameKey && i.kind === "game");
  if (!game) return <p>Not on the device any more.</p>;
  const byKey = new Map(data.items.map((i) => [i.key, i]));
  const packages = data.items.filter((i): i is Package => i.kind === "package" && i.game === game.shortName);
  const typeOf = (p: Package) => packageType(p, byKey);
  const present = PACKAGE_TYPES.filter((t) => packages.some((p) => typeOf(p) === t.type));
  // Swiping a package away removes it (and what lives in it) from the device, after a check.
  const remove = async (pkg: Package) => {
    const needing = packages.filter((p) => p.key !== pkg.key && !p.stubsFor && needsOf(p, data.items).includes(pkg.key)).map((p) => p.name);
    const also = needing.length ? `\n\n${needing.join(", ")} need${needing.length === 1 ? "s" : ""} it: names in ${needing.length === 1 ? "it" : "them"} will become “not entered yet”.` : "";
    if (!confirm(`Remove ${pkg.name} and the ${pkg.members.length} items in it from this device?${also}`)) return;
    await data.removePackage(pkg.key);
    setChanged((n) => n + 1);
  };
  const toggle = (id: string) => setFolded((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : new Set([...f, id])));

  return (
    <section>
      <h1>{game.name}</h1>
      <p className="sub">
        Statline {game.statlines.model.join(" ")} · categories {game.categories.join(", ")}
      </p>
      <GameConfig data={data} nav={nav} game={game} onSaved={() => setChanged((n) => n + 1)} />
      <div className="chips">
        <button className={view === "nesting" ? "on" : ""} onClick={() => setView("nesting")}>As the books nest</button>
        <button className={view === "sections" ? "on" : ""} onClick={() => setView("sections")}>All, by type</button>
        {present.map((t) => (
          <button key={t.type} className={view === t.type ? "on" : ""} onClick={() => setView(t.type)}>{t.title}</button>
        ))}
      </div>

      {view === "nesting" ? (
        sectionsOf(packages.filter((p) => !p.partOf && !p.stubsFor)).map(([section, tops]) => (
          <div key={section ?? ""}>
            {section && (
              <h2 className="fold" onClick={() => toggle("section:" + section)}>
                {folded.has("section:" + section) ? "▸" : "▾"} {section}
              </h2>
            )}
            {!folded.has("section:" + section) && (
              <ul className="list">
                {tops.map((p) => (
                  <Branch key={p.key} pkg={p} all={packages.filter((x) => !x.stubsFor)} nav={nav} depth={0} folded={folded} toggle={toggle} onRemove={remove} />
                ))}
              </ul>
            )}
          </div>
        ))
      ) : (
        present
          .filter((t) => view === "sections" || view === t.type)
          .map((t) => {
            const inSection = packages.filter((p) => typeOf(p) === t.type);
            const open = view === t.type || !folded.has(t.type);
            return (
              <div key={t.type}>
                <h2 className="fold" onClick={() => toggle(t.type)}>
                  {open ? "▾" : "▸"} {t.title} <span className="sub">{t.type === "stubs" ? inSection.reduce((n, p) => n + p.members.length, 0) + " names" : inSection.length}</span>
                </h2>
                {open && t.type === "stubs" && <StubList packages={inSection} items={data.items} nav={nav} />}
                {open && t.type !== "stubs" && (
                  <ul className="list">
                    {inSection.map((p) => <PackageButton key={p.key} pkg={p} items={data.items} nav={nav} onRemove={remove} />)}
                  </ul>
                )}
              </div>
            );
          })
      )}

      <h2>Everything in the game, across books</h2>
      <div className="buttons">
        {BROWSE_KINDS.map((k) => (
          <button key={k.kind} onClick={() => nav.open({ name: "browse", game: game.shortName, kind: k.kind })}>{k.title}</button>
        ))}
      </div>

      <h2>Download the whole game</h2>
      <div className="buttons">
        <button onClick={() => saveFile(downloadGameWorkbook(data.items, game))}>Workbook (Excel, Google Sheets)</button>
        <button onClick={() => saveFile(downloadGameZip(data.items, game))}>Folder of CSVs (.zip)</button>
        <button onClick={() => saveFile(downloadGameSheetYaml(data.items, game))}>Sheet YAML</button>
        <button onClick={() => saveFile(downloadFullYaml(gameItems(data.items, game), `${game.shortName}-stored.yaml`))}>Stored form (YAML)</button>
      </div>
    </section>
  );
}

function PackageButton({ pkg, items, nav, onRemove }: { pkg: Package; items: Item[]; nav: Nav; onRemove: (p: Package) => void }) {
  return (
    <li>
      <SwipeRow action="Remove" onAction={() => onRemove(pkg)}>
        <button onClick={() => nav.open({ name: "package", key: pkg.key })}>
          <span className="title">{pkg.name}</span>
          <span className="sub">
            {pkg.partOf ? `in ${nameOf(pkg.partOf, items)} · ` : ""}
            {pkg.members.length} items
          </span>
        </button>
      </SwipeRow>
    </li>
  );
}

// Top-level packages under their Library heading ("App specific"); those with none come first.
function sectionsOf(packages: Package[]): [string | undefined, Package[]][] {
  const groups = new Map<string | undefined, Package[]>();
  for (const p of packages) groups.set(p.section, [...(groups.get(p.section) ?? []), p]);
  return [...groups].sort(([a], [b]) => (a === undefined ? -1 : b === undefined ? 1 : a.localeCompare(b)));
}

function Branch(props: { pkg: Package; all: Package[]; nav: Nav; depth: number; folded: Set<string>; toggle: (id: string) => void; onRemove: (p: Package) => void }) {
  const { pkg, all, nav, depth, folded, toggle, onRemove } = props;
  const children = all.filter((p) => p.partOf === pkg.key);
  const open = !folded.has(pkg.key);
  return (
    <>
      <li className="branch" style={{ paddingLeft: depth * 18 }}>
        {children.length > 0 ? <button className="twisty" onClick={() => toggle(pkg.key)}>{open ? "▾" : "▸"}</button> : <span className="twisty" />}
        <SwipeRow action="Remove" onAction={() => onRemove(pkg)}>
          <button onClick={() => nav.open({ name: "package", key: pkg.key })}>
            <span className="title">{pkg.name}</span>
            <span className="sub">{pkg.layer} · {pkg.members.length} items</span>
          </button>
        </SwipeRow>
      </li>
      {open && children.map((c) => <Branch key={c.key} {...props} pkg={c} depth={depth + 1} />)}
    </>
  );
}

// Names that match nothing yet, each with where it's named. Entering the real item, in whichever
// package it belongs, replaces the stub; nothing needs moving.
function StubList({ packages, items, nav }: { packages: Package[]; items: Item[]; nav: Nav }) {
  return (
    <>
      <p className="hint">Names used but not entered. Enter each in the package it belongs to (a lore in the rulebook, say) and its stub goes.</p>
      {packages.map((p) => (
        <details key={p.key} className="stub-group">
          <summary>
            Named in {nameOf(p.stubsFor!, items)} <span className="sub">{p.members.length}</span>
          </summary>
          <ul className="plain">
            {p.members.map((k) => (
              <li key={k}>
                <button className="link stub-link" onClick={() => nav.open({ name: "item", key: k })}>{nameOf(k, items)}</button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}

export function nameOf(key: string, items: Item[]): string {
  return items.find((i) => i.key === key)?.name ?? key;
}
