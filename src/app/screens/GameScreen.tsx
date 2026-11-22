// A game: its settings and its packages, as the download folders lay them out.
import type { Game, Item, Package } from "../../items/items";
import { downloadFullYaml, downloadGameSheetYaml, downloadGameZip, gameItems } from "../../library/upload";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { saveFile } from "../save-file";

export function GameScreen({ data, nav, gameKey }: { data: AppData; nav: Nav; gameKey: string }) {
  const game = data.items.find((i): i is Game => i.key === gameKey && i.kind === "game");
  if (!game) return <p>Not on the device any more.</p>;
  const packages = data.items.filter((i): i is Package => i.kind === "package" && i.game === game.shortName);
  const top = packages.filter((p) => !p.partOf && !p.stubsFor);
  const stubCount = packages.filter((p) => p.stubsFor).reduce((n, p) => n + p.members.length, 0);
  return (
    <section>
      <h1>{game.name}</h1>
      <p className="sub">
        Statline {game.statlines.model.join(" ")} · categories {game.categories.join(", ")}
      </p>
      <h2>Packages</h2>
      <ul className="list">{top.map((p) => <PackageLine key={p.key} pkg={p} all={packages} nav={nav} depth={0} />)}</ul>
      {stubCount > 0 && (
        <p className="hint">
          {stubCount} names match nothing yet: they're kept as stubs in “Stubs: …” under the package that names them.
        </p>
      )}
      <h2>Download</h2>
      <div className="buttons">
        <button onClick={() => saveFile(downloadGameZip(data.items, game))}>Folder (.zip)</button>
        <button onClick={() => saveFile(downloadGameSheetYaml(data.items, game))}>Sheet YAML</button>
        <button onClick={() => saveFile(downloadFullYaml(gameItems(data.items, game), `${game.shortName}-stored.yaml`))}>Stored form (YAML)</button>
      </div>
    </section>
  );
}

function PackageLine({ pkg, all, nav, depth }: { pkg: Package; all: Package[]; nav: Nav; depth: number }) {
  const children = all.filter((p) => p.partOf === pkg.key || p.stubsFor === pkg.key);
  return (
    <>
      <li style={{ paddingLeft: depth * 16 }}>
        <button onClick={() => nav.open({ name: "package", key: pkg.key })}>
          <span className="title">{pkg.name}</span>
          <span className="sub">
            {pkg.stubsFor ? "made by the app" : pkg.layer} · {pkg.members.length} items
          </span>
        </button>
      </li>
      {children.map((c) => (
        <PackageLine key={c.key} pkg={c} all={all} nav={nav} depth={depth + 1} />
      ))}
    </>
  );
}

export function nameOf(key: string, items: Item[]): string {
  return items.find((i) => i.key === key)?.name ?? key;
}
