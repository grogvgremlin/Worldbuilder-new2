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
import { SearchScreen } from "./screens/SearchScreen";
import type { Scope } from "../library/search";
import { BrowseScreen, type BrowseKind } from "./screens/BrowseScreen";
import { ListsScreen } from "./screens/lists/ListsScreen";
import { PickupGameScreen } from "./screens/lists/PickupGameScreen";
import { RosterScreen } from "./screens/lists/RosterScreen";
import { RosterUnitScreen } from "./screens/lists/RosterUnitScreen";
import { RosterItemsScreen } from "./screens/lists/RosterItemsScreen";
import { useBackSwipe } from "./swipe";
import { PresetScreen } from "./screens/config/PresetScreen";
import { SettingScreen } from "./screens/config/SettingScreen";
import { WorldsScreen } from "./screens/world/WorldsScreen";
import { NewKindScreen, WorldScreen, type NewKindWhat } from "./screens/world/WorldScreen";
import { PlaceScreen } from "./screens/world/PlaceScreen";
import { MapScreen } from "./screens/world/MapScreen";
import { LinkKindScreen, ThingKindScreen } from "./screens/world/KindScreens";
import { LinkScreen } from "./screens/world/LinkScreen";
import { worldOf } from "../world/world";
import { WorldBar } from "./screens/world/Trail";

export type Screen =
  | { name: "library" }
  | { name: "game"; key: string }
  | { name: "package"; key: string }
  | { name: "grid"; packageKey: string; tab: TabId }
  | { name: "item"; key: string }
  | { name: "browse"; game: string; kind: BrowseKind }
  | { name: "preset"; game: string; index: number }
  | { name: "game-setting"; game: string; index: number }
  | { name: "draft" }
  | { name: "search"; start: Scope }
  | { name: "data" }
  | { name: "lists" }
  | { name: "pickup"; key: string }
  | { name: "roster"; key: string }
  | { name: "roster-unit"; roster: string; unit: string }
  | { name: "roster-items"; roster: string; unit: string; where: string; allowance: string }
  | { name: "world-root" } // the open world's page, or your worlds when none is open
  | { name: "worlds" }
  | { name: "place"; key: string }
  | { name: "map"; key: string; focus?: string; place?: string }
  | { name: "thing-kind"; key: string }
  | { name: "link-kind"; key: string }
  | { name: "link"; key: string }
  | { name: "new-kind"; world: string; what: NewKindWhat };

export type Nav = { open: (s: Screen) => void; back: () => void; home: () => void; popTo: (index: number) => void };

// A screen can stop you leaving it (a unit with a required choice not made: owner, 24 Nov).
// The guard says why, and whether you may leave anyway after a warning.
export type Guard = () => { message: string; mayLeave: boolean } | null;
let leaveGuard: Guard | null = null;
export function setLeaveGuard(guard: Guard | null) {
  leaveGuard = guard;
}
function mayLeave(): boolean {
  const stop = leaveGuard?.();
  if (!stop) return true;
  if (stop.mayLeave) return confirm(`${stop.message}\n\nLeave anyway?`);
  alert(stop.message);
  return false;
}

type Tool = "world" | "lists" | "battle" | "campaign" | "settings";

const TOOLS: { id: Tool; label: string; comingNext: string }[] = [
  { id: "world", label: "World", comingNext: "" },
  { id: "lists", label: "Lists", comingNext: "" },
  { id: "battle", label: "Battle", comingNext: "Battles come later." },
  { id: "campaign", label: "Campaign", comingNext: "Campaigns come later." },
];

const ROOTS: Record<Tool, Screen | null> = { world: { name: "world-root" }, lists: { name: "lists" }, battle: null, campaign: null, settings: { name: "library" } };

// Escape closes whatever pop-up or menu is open, the top one first (owner, 28 Nov): pop-ups close when
// their backdrop is tapped, so Escape taps it.
function useEscapeCloses() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = [...document.querySelectorAll<HTMLElement>(".popup-back, .menu-catcher")];
      const top = open[open.length - 1];
      if (top) top.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App({ data }: { data: AppData }) {
  useEscapeCloses();
  const [tool, setTool] = useState<Tool>(data.items.some((i) => i.kind === "game") ? "lists" : "settings");
  const [stacks, setStacks] = useState<Record<Tool, Screen[]>>({ world: [{ name: "world-root" }], lists: [{ name: "lists" }], battle: [], campaign: [], settings: [{ name: "library" }] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const stack = stacks[tool];
  const setStack = (next: (st: Screen[]) => Screen[]) => setStacks((all) => ({ ...all, [tool]: next(all[tool]) }));
  const nav: Nav = {
    open: (s) => setStack((st) => [...st, s]),
    back: () => mayLeave() && setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    home: () => mayLeave() && setStack(() => (ROOTS[tool] ? [ROOTS[tool]!] : [])),
    popTo: (index) => mayLeave() && setStack((st) => st.slice(0, index + 1)), // back to a screen on the way here
  };
  const screen = stack[stack.length - 1];
  const backSwipe = useBackSwipe(() => nav.back());
  // Opening a world (from the switcher or the list) starts the World tab afresh on it.
  const openWorld = async (key: string) => {
    await data.setOpenWorld(key);
    setStacks((all) => ({ ...all, world: [{ name: "world-root" }] }));
    setTool("world");
  };
  const showSwitcher = tool === "world" || tool === "campaign";
  const openWorldName = data.openWorld ? worldOf(data.items, data.openWorld)?.name : undefined;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, tool]);

  return (
    <div className="app" {...backSwipe}>
      <div className="top-wrap">
      <header className="top">
        {stack.length > 1 ? (
          <button className="link back" onClick={nav.back}>‹ Back</button>
        ) : showSwitcher ? (
          <button className="link world-chip" onClick={() => setStacks((all) => ({ ...all, [tool]: [...all[tool], { name: "worlds" }] }))}>
            {openWorldName ?? "Choose a world"} ▾
          </button>
        ) : (
          <span className="brand">Worldbuilder</span>
        )}
        <span className="header-links">

          <button className="link" aria-label="Search" onClick={() => screen?.name !== "search" && nav.open({ name: "search", start: scopeOf(screen, data) })}>Search</button>
          <button className={"link" + (tool === "settings" ? " current" : "")} onClick={() => mayLeave() && setTool("settings")}>
            Settings
          </button>
        </span>
      </header>
      {/* The World bar (owner, 26 Nov): the world's sections and the way here, fixed under the
          header on every World screen, full width so it doesn't move when a map or the Diagram widens. */}
      {tool === "world" && data.openWorld && worldOf(data.items, data.openWorld) && screen?.name !== "worlds" && (
        <WorldBar data={data} stack={stack} popTo={(n) => (nav.popTo(n), refresh())} />
      )}
      </div>

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
            {render(screen, data, nav, draft, setDraft, refresh, openWorld)}
          </>
        )}
      </main>

      <nav className="tabs">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? "on" : ""} onClick={() => mayLeave() && setTool(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function render(screen: Screen, data: AppData, nav: Nav, draft: Draft | null, setDraft: (d: Draft | null) => void, refresh: () => void, openWorld: (key: string) => void) {
  switch (screen.name) {
    case "world-root":
      return data.openWorld && worldOf(data.items, data.openWorld) ? <WorldScreen key={data.openWorld} data={data} nav={nav} worldKey={data.openWorld} /> : <WorldsScreen data={data} onOpen={openWorld} />;
    case "worlds":
      return <WorldsScreen data={data} onOpen={openWorld} />;
    case "place":
      return <PlaceScreen key={screen.key} data={data} nav={nav} thingKey={screen.key} />;
    case "map":
      return <MapScreen key={`${screen.key}|${screen.focus}|${screen.place}`} data={data} nav={nav} mapKey={screen.key} focus={screen.focus} place={screen.place} />;
    case "thing-kind":
      return <ThingKindScreen key={screen.key} data={data} nav={nav} kindKey={screen.key} />;
    case "new-kind":
      return <NewKindScreen key={screen.what} data={data} nav={nav} world={screen.world} what={screen.what} />;
    case "link":
      return <LinkScreen key={screen.key} data={data} nav={nav} linkKey={screen.key} />;
    case "link-kind":
      return <LinkKindScreen key={screen.key} data={data} nav={nav} kindKey={screen.key} />;
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
    case "preset":
      return <PresetScreen data={data} nav={nav} gameKey={screen.game} index={screen.index} />;
    case "game-setting":
      return <SettingScreen data={data} nav={nav} gameKey={screen.game} index={screen.index} />;
    case "browse":
      return <BrowseScreen data={data} nav={nav} game={screen.game} kind={screen.kind} />;
    case "draft":
      return draft ? (
        <DraftScreen
          draft={draft}
          onChoose={(key, choice) => setDraft(data.choose(draft, key, choice))}
          onAccept={async () => (await data.accept(draft), setDraft(null), refresh(), nav.home())}
          onDiscard={() => (setDraft(null), nav.home())}
        />
      ) : (
        <p>Nothing waiting.</p>
      );
    case "data":
      return <DataScreen data={data} onWiped={refresh} />;
    case "search":
      // Keyed by where it was opened from, so it starts afresh there (not on the scope used last time).
      return <SearchScreen key={JSON.stringify(screen.start)} data={data} nav={nav} start={screen.start} />;
    case "lists":
      return <ListsScreen data={data} nav={nav} />;
    case "pickup":
      return <PickupGameScreen data={data} nav={nav} contextKey={screen.key} />;
    case "roster":
      return <RosterScreen data={data} nav={nav} rosterKey={screen.key} />;
    case "roster-unit":
      return <RosterUnitScreen data={data} nav={nav} rosterKey={screen.roster} unitId={screen.unit} />;
    case "roster-items":
      return <RosterItemsScreen data={data} nav={nav} rosterKey={screen.roster} unitId={screen.unit} where={screen.where} allowance={screen.allowance} />;
  }
}

// Search opens on where you are (owner, 24 Nov): a list, a set-up, your lists, a package, the library.
function scopeOf(screen: Screen | undefined, data: AppData): Scope {
  if (!screen) return { kind: "library" };
  if (screen.name === "roster") return { kind: "roster", key: screen.key };
  if (screen.name === "roster-unit" || screen.name === "roster-items") return { kind: "roster", key: screen.roster };
  if (screen.name === "pickup") return { kind: "context", key: screen.key };
  if (screen.name === "lists") return { kind: "lists" };
  if (screen.name === "package") return { kind: "package", key: screen.key };
  if (screen.name === "game") {
    const game = data.items.find((i) => i.key === screen.key);
    return game?.kind === "game" ? { kind: "game", key: game.shortName } : { kind: "library" };
  }
  if (screen.name === "browse") return { kind: "game", key: screen.game };
  if (screen.name === "grid") return { kind: "package", key: screen.packageKey };
  if (screen.name === "item") {
    const home = data.items.find((i) => i.key === screen.key)?.homePackage;
    return home ? { kind: "package", key: home } : { kind: "library" };
  }
  return { kind: "library" };
}
