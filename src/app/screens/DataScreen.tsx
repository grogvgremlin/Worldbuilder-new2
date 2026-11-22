// Settings → Data: storage on this device, the build running, and wiping the library.
import { useEffect, useState } from "react";
import type { AppData } from "../app-data";

export function DataScreen({ data, onWiped }: { data: AppData; onWiped: () => void }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const wipe = async () => {
    if (!confirm("Remove everything in the library from this device?")) return;
    await data.wipe();
    onWiped();
  };
  return (
    <section>
      <h1>Data</h1>
      <ul className="plain">
        <li>{data.items.length} items in the library</li>
        <li>Storage: {persisted === null ? "unknown" : persisted ? "kept (persistent)" : "may be cleared by the browser — add the app to the home screen"}</li>
        <li className="sub">Build {__APP_VERSION__}</li>
      </ul>
      <div className="buttons">
        <button className="danger" onClick={wipe}>Wipe the library</button>
      </div>
    </section>
  );
}
