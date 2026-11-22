// The app frame: the four tools as bottom tabs, Settings (Library, Data) from the header, and a back
// stack of opened screens for each tab. Screens only show things and call AppData.
// Placement: Library under Settings (owner, 21–22 Nov: "load everything, which creates the library");
// pick-up games and their rosters under Lists (CLAUDE.md "Where things go", archived build).

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
import { BrowseScreen, type BrowseKind } from "./screens/BrowseScreen";
import { ListsScreen } from "./screens/lists/ListsScreen";
import { PickupGameScreen } from "./screens/lists/PickupGameScreen";
import { RosterScreen } from "./screens/lists/RosterScreen";
import { RosterUnitScreen } from "./screens/lists/RosterUnitScreen";
import { useBackSwipe } from "./swipe";

export type Screen =
  | { name: "library" }
  | { name: "game"; key: string }
  | { name: "package"; key: string }
  | { name: "grid"; packageKey: string; tab: TabId }
  | { name: "item"; key: string }
  | { name: "browse"; game: string; kind: BrowseKind }
  | { name: "draft" }
  | { name: "data" }
  | { name: "lists" }
  | { name: "pickup"; key: string }
  | { name: "roster"; key: string }
  | { name: "roster-unit"; roster: string; unit: string };

export type Nav = { open: (s: Screen) => void; back: () => void; home: () => void };

type Tool = "world" | "lists" | "battle" | "campaign" | "settings";

const TOOLS: { id: Tool; label: string; comingNext: string }[] = [
  { id: "world", label: "World", comingNext: "Worlds come after Lists." },
  { id: "lists", label: "Lists", comingNext: "" },
  { id: "battle", label: "Battle", comingNext: "Battles come later." },
  { id: "campaign", label: "Campaign", comingNext: "Campaigns come later." },
];

const ROOTS: Record<Tool, Screen | null> = { world: null, lists: { name: "lists" }, battle: null, campaign: null, settings: { name: "library" } };

export function App({ data }: { data: AppData }) {
  const [tool, setTool] = useState<Tool>(data.items.length ? "lists" : "settings");
  const [stacks, setStacks] = useState<Record<Tool, Screen[]>>({ world: [], lists: [{ name: "lists" }], battle: [], campaign: [], settings: [{ name: "library" }] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const stack = stacks[tool];
  const setStack = (next: (st: Screen[]) => Screen[]) => setStacks((all) => ({ ...all, [tool]: next(all[tool]) }));
  const nav: Nav = {
    open: (s) => setStack((st) => [...st, s]),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    home: () => setStack(() => (ROOTS[tool] ? [ROOTS[tool]!] : [])),
  };
  const screen = stack[stack.length - 1];
  const backSwipe = useBackSwipe(() => nav.back());
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, tool]);

  return (
    <div className="app" {...backSwipe}>
      <header className="top">
        {stack.length > 1 ? (
          <button className="link back" onClick={nav.back}>‹ Back</button>
        ) : (
          <span className="brand">Worldbuilder</span>
        )}
        <button className={"link" + (tool === "settings" ? " current" : "")} onClick={() => setTool("settings")}>
          Settings
        </button>
      </header>

      <main>
        {!screen ? (
          <section className="empty">
            <h1>{TOOLS.find((t) => t.id === tool)!.label}</h1>
            <p>{TOOLS.find((t) => t.id === tool)!.comingNext}</p>
          </section>
        ) : (
          <>
            {tool === "settings" && stack.length === 1 && (
              <nav className="segments">
                <button className={screen.name === "library" ? "on" : ""} onClick={() => setStack(() => [{ name: "library" }])}>Library</button>
                <button className={screen.name === "data" ? "on" : ""} onClick={() => setStack(() => [{ name: "data" }])}>Data</button>
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
    case "lists":
      return <ListsScreen data={data} nav={nav} />;
    case "pickup":
      return <PickupGameScreen data={data} nav={nav} contextKey={screen.key} />;
    case "roster":
      return <RosterScreen data={data} nav={nav} rosterKey={screen.key} />;
    case "roster-unit":
      return <RosterUnitScreen data={data} nav={nav} rosterKey={screen.roster} unitId={screen.unit} />;
  }
}
