// Opens the device's storage, starts the offline worker, and shows the app.
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AppData } from "./app-data";
import { App } from "./App";
import { askForPersistentStorage, IndexedDbStore } from "../store/store";
import "./styles.css";

async function start() {
  registerSW({ immediate: true });
  const data = new AppData(await IndexedDbStore.open());
  await data.load();
  askForPersistentStorage();
  createRoot(document.getElementById("root")!).render(<App data={data} />);
}

start();
