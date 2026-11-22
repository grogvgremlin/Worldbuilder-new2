// Settings → Library: every game on the device, and uploading more.
import { useRef, useState } from "react";
import type { Game } from "../../items/items";
import type { AppData, Draft } from "../app-data";
import type { Nav } from "../App";
import { SwipeRow } from "../swipe";

export function LibraryScreen({ data, nav, onDraft }: { data: AppData; nav: Nav; onDraft: (d: Draft) => void }) {
  const [, setChanged] = useState(0);
  const removeGame = async (g: Game) => {
    if (!confirm(`Remove ${g.name} and every package in it from this device?`)) return;
    await data.removeGame(g.key);
    setChanged((n) => n + 1);
  };
  const games = data.items.filter((i): i is Game => i.kind === "game");
  return (
    <section>
      <h1>Library</h1>
      {games.length === 0 && (
        <p className="hint">
          Nothing loaded yet. Upload a game: its folder as a <b>.zip</b>, or a <b>.yaml</b> downloaded from here. Packages can then be added as
          workbooks (<b>.xlsx</b>) or YAML.
        </p>
      )}
      <ul className="list">
        {games.map((g) => {
          const packages = data.items.filter((i) => i.kind === "package" && i.game === g.shortName && !i.stubsFor);
          return (
            <li key={g.key}>
              <SwipeRow action="Remove" onAction={() => removeGame(g)}>
                <button onClick={() => nav.open({ name: "game", key: g.key })}>
                  <span className="title">{g.name}</span>
                  <span className="sub">{packages.length} packages</span>
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
      <UploadButton data={data} onDraft={onDraft} />
    </section>
  );
}

export function UploadButton({ data, onDraft, label = "Upload…" }: { data: AppData; onDraft: (d: Draft) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const read = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const uploads = await Promise.all([...files].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const draft = await data.readDraft(uploads);
    setBusy(false);
    if (input.current) input.current.value = "";
    onDraft(draft);
  };
  return (
    <>
      {/* No "accept" filter: on an iPhone it greys out .zip and .yaml files in Files. The reader says if a file isn't one it reads. */}
      <input ref={input} type="file" multiple hidden onChange={(e) => read(e.target.files)} />
      <button className="primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Reading…" : label}
      </button>
    </>
  );
}
