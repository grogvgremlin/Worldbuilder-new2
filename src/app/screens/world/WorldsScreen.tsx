// World → your worlds: open one, start one, swipe one away. Also the header's world switcher
// (shown on World and Campaign only: kickoff, CLAUDE.md "Where things go").
// Design: design/world-structure.md §2 (a world's kinds are its own content: a new world starts from
// a starter set of kinds, or blank, or the sample to try things on).
import { useState } from "react";
import { newWorld, removeWorld, thingsIn, worlds, type WorldStart } from "../../../world/world";
import type { AppData } from "../../app-data";
import { SwipeRow } from "../../swipe";

export function WorldsScreen({ data, onOpen }: { data: AppData; onOpen: (world: string) => void }) {
  const [, setChanged] = useState(0);
  const all = worlds(data.items);

  const remove = async (key: string, name: string) => {
    const count = thingsIn(data.items, key).length;
    if (!confirm(`Remove ${name}${count ? ` and its ${count} thing${count > 1 ? "s" : ""}` : ""}? This can't be undone.`)) return;
    await data.setItems(removeWorld(data.items, key));
    if (data.openWorld === key) await data.setOpenWorld(null);
    setChanged((n) => n + 1);
  };

  return (
    <section>
      <h1>Worlds</h1>
      {all.length === 0 && <p className="hint">No world yet. Start one below, or try the sample.</p>}
      <ul className="list">
        {all.map((w) => (
          <li key={w.key}>
            <SwipeRow action="Remove" onAction={() => remove(w.key, w.name)}>
              <button onClick={() => onOpen(w.key)}>
                <span className="title">{w.name}{data.openWorld === w.key ? " ✓" : ""}</span>
                <span className="sub">{thingsIn(data.items, w.key).length} items{w.description ? ` · ${w.description}` : ""}</span>
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
      <NewWorld data={data} onMade={onOpen} />
    </section>
  );
}

const STARTS: { id: WorldStart; label: string; about: string }[] = [
  { id: "starter", label: "Starter", about: "One kind, Place (add fields to an item as you need them); \"in\" to put items inside items, and \"in area\" for groups." },
  { id: "sample", label: "Sample", about: "The starter plus a few made-up provinces and towns on a map, to try things on." },
  { id: "blank", label: "Blank", about: "Nothing: make your own kinds first." },
];

function NewWorld({ data, onMade }: { data: AppData; onMade: (world: string) => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState<WorldStart>("starter");
  const make = async () => {
    const made = newWorld(data.items, name || (start === "sample" ? "Averland borders" : "New world"), start);
    await data.setItems([...data.items, ...made]);
    onMade(made[0].key);
  };
  return (
    <div className="form">
      <h2>New world</h2>
      <input className="filter" placeholder="Name (e.g. The Old World, 2524)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="chips">
        {STARTS.map((s) => (
          <button key={s.id} className={start === s.id ? "on" : ""} onClick={() => setStart(s.id)}>{s.label}</button>
        ))}
      </div>
      <p className="sub">{STARTS.find((s) => s.id === start)!.about}</p>
      <div className="buttons">
        <button className="primary" onClick={make}>Start</button>
      </div>
    </div>
  );
}
