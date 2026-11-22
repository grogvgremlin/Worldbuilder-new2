// The app frame: the four tools as bottom tabs, Settings (Library, Data) from the header,
// and a back stack of the screens opened. Screens only show things and call AppData.
// Placement: Library sits under Settings (owner, 21–22 Nov: "load everything, which creates the library").

import { useEffect, useState } from "react";
import { AppData, type Draft } from "./app-data";
import type { TabId } from "../packages/package-sheets";
import { LibraryScreen } from "./screens/LibraryScreen";
import { GameScreen } from "./screens/GameScreen";
import { PackageScreen } from "./screens/PackageScreen";
import { GridScreen } from "./screens/GridScreen";
import { ItemScreen } from "./screens/ItemScreen";
import { DraftScreen } from "./screens/DraftScreen";
import { DataScreen } from "./screens/DataScreen";
import { useBackSwipe } from "./swipe";
import { BrowseScreen, type BrowseKind } from "./screens/BrowseScreen";

export type Screen =
  | { name: "library" }
  | { name: "game"; key: string }
  | { name: "package"; key: string }
  | { name: "grid"; packageKey: string; tab: TabId }
  | { name: "item"; key: string }
  | { name: "browse"; game: string; kind: BrowseKind }
  | { name: "draft" }
  | { name: "data" };

export type Nav = { open: (s: Screen) => void; back: () => void; home: () => void };

type Tool = "world" | "lists" | "battle" | "campaign" | "settings";

const TOOLS: { id: Tool; label: string; comingNext: string }[] = [
  { id: "world", label: "World", comingNext: "Worlds come after Lists." },
  { id: "lists", label: "Lists", comingNext: "Next: a pick-up game — choose a game and your books, build a list, take it to the table." },
  { id: "battle", label: "Battle", comingNext: "Battles come later." },
  { id: "campaign", label: "Campaign", comingNext: "Campaigns come later." },
];

export function App({ data }: { data: AppData }) {
  const [tool, setTool] = useState<Tool>("settings");
  const [stack, setStack] = useState<Screen[]>([{ name: "library" }]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const nav: Nav = {
    open: (s) => setStack((st) => [...st, s]),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    home: () => setStack([{ name: "library" }]),
  };
  const screen = stack[stack.length - 1];
  const backSwipe = useBackSwipe(() => tool === "settings" && nav.back());
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, tool]);

  return (
    <div className="app" {...backSwipe}>
      <header className="top">
        {tool === "settings" && stack.length > 1 ? (
          <button className="link back" onClick={nav.back}>‹ Back</button>
        ) : (
          <span className="brand">Worldbuilder</span>
        )}
        <button className={"link" + (tool === "settings" ? " current" : "")} onClick={() => setTool("settings")}>
          Settings
        </button>
      </header>

      <main>
        {tool !== "settings" ? (
          <section className="empty">
            <h1>{TOOLS.find((t) => t.id === tool)!.label}</h1>
            <p>{TOOLS.find((t) => t.id === tool)!.comingNext}</p>
          </section>
        ) : (
          <>
            {stack.length === 1 && (
              <nav className="segments">
                <button className={screen.name === "library" ? "on" : ""} onClick={() => setStack([{ name: "library" }])}>Library</button>
                <button className={screen.name === "data" ? "on" : ""} onClick={() => setStack([{ name: "data" }])}>Data</button>
              </nav>
            )}
            {render(screen, data, nav, draft, setDraft, refresh)}
          </>
        )}
      </main>

      <nav className="tabs">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? "on" : ""} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function render(screen: Screen, data: AppData, nav: Nav, draft: Draft | null, setDraft: (d: Draft | null) => void, refresh: () => void) {
  switch (screen.name) {
    case "library":
      return <LibraryScreen data={data} nav={nav} onDraft={(d) => (setDraft(d), nav.open({ name: "draft" }))} />;
    case "game":
      return <GameScreen data={data} nav={nav} gameKey={screen.key} />;
    case "package":
      return <PackageScreen data={data} nav={nav} packageKey={screen.key} />;
    case "grid":
      return <GridScreen data={data} nav={nav} packageKey={screen.packageKey} tab={screen.tab} />;
    case "item":
      return <ItemScreen data={data} nav={nav} itemKey={screen.key} />;
    case "browse":
      return <BrowseScreen data={data} nav={nav} game={screen.game} kind={screen.kind} />;
    case "draft":
      return draft ? (
        <DraftScreen
          draft={draft}
          onAccept={async () => (await data.accept(draft), setDraft(null), refresh(), nav.home())}
          onDiscard={() => (setDraft(null), nav.home())}
        />
      ) : (
        <p>Nothing waiting.</p>
      );
    case "data":
      return <DataScreen data={data} onWiped={refresh} />;
  }
}
