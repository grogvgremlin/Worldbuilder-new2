// Opens the device's storage, starts the offline worker, and shows the app. If anything fails on the
// way, the page says what (src/app/startup-error.tsx) rather than staying blank.
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AppData } from "./app-data";
import { App } from "./App";
import { askForPersistentStorage, IndexedDbStore } from "../store/store";
import { ErrorBoundary, ErrorPanel } from "./startup-error";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

async function start() {
  registerSW({ immediate: true });
  const data = new AppData(await IndexedDbStore.open());
  await data.load();
  askForPersistentStorage();
  root.render(
    <ErrorBoundary>
      <App data={data} />
    </ErrorBoundary>,
  );
}

start().catch((error) => root.render(<ErrorPanel error={error} />));
