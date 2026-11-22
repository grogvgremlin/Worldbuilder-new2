// Settings → Data: storage on this device, the build running, a backup of everything (library,
// pick-up contexts and lists) and restoring it, and removing things.
import { useEffect, useRef, useState } from "react";
import type { AppData } from "../app-data";
import { downloadFullYaml } from "../../library/upload";
import { saveFile } from "../save-file";

export function DataScreen({ data, onWiped }: { data: AppData; onWiped: () => void }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const counts = {
    library: data.items.filter((i) => !["context", "roster", "sandbox"].includes(i.kind)).length,
    contexts: data.items.filter((i) => i.kind === "context").length,
    lists: data.items.filter((i) => i.kind === "roster").length,
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm("Replace everything on this device with this backup?")) return;
    const problems = await data.restore(await file.text());
    setMessage(problems.length ? `Not restored: ${problems.slice(0, 3).join("; ")}` : "Restored.");
    if (input.current) input.current.value = "";
    onWiped();
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section>
      <h1>Data</h1>
      <ul className="plain">
        <li>
          Library: {counts.library} items · Pick-up: {counts.contexts} set-ups, {counts.lists} lists
        </li>
        <li>Storage: {persisted === null ? "unknown" : persisted ? "kept (persistent)" : "may be cleared by the browser — add the app to the home screen"}</li>
        <li className="sub">Build {__APP_VERSION__}</li>
      </ul>

      <h2>Backup</h2>
      <p className="sub">Everything on this device in one file: the library, your pick-up set-ups and lists. Keep it somewhere safe, or open it on another device.</p>
      <div className="buttons">
        <button className="primary" onClick={() => saveFile(downloadFullYaml(data.everything(), `worldbuilder-backup-${today}.yaml`))}>Save a backup</button>
        <button onClick={() => input.current?.click()}>Restore from a backup…</button>
      </div>
      <input ref={input} type="file" hidden onChange={(e) => restore(e.target.files?.[0])} />
      {message && <p className="hint">{message}</p>}

      <h2>Remove</h2>
      <div className="buttons">
        <button
          className="danger"
          onClick={async () => {
            if (!confirm("Remove the library (games and books)? Your pick-up set-ups and lists stay.")) return;
            await data.wipeLibrary();
            onWiped();
          }}
        >
          Remove the library only
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (!confirm("Remove everything on this device: the library, your pick-up set-ups and lists?")) return;
            await data.wipe();
            onWiped();
          }}
        >
          Remove everything
        </button>
      </div>
    </section>
  );
}
