// When the app can't start or a screen fails, say why instead of showing a blank page (owner, 26 Nov:
// "I just get a blank cream coloured page"). Offers a reload, and clearing the app's offline copy
// (its cached files and service worker), which never touches what's saved: lists, worlds, library.
import { Component, type ReactNode } from "react";

// Cached app files out, then reload: fetches the current version from the site.
export async function clearOfflineCopy(): Promise<void> {
  try {
    const workers = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(workers.map((w) => w.unregister()));
    const names = (await caches?.keys()) ?? [];
    await Promise.all(names.map((n) => caches.delete(n)));
  } finally {
    location.reload();
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(0, 6).join("\n")}`;
  return String(error);
}

export function ErrorPanel({ error }: { error: unknown }) {
  return (
    <section className="startup-error">
      <h1>Something went wrong</h1>
      <p>Nothing you've saved is lost. Try these in order, and if it still happens, send the message below.</p>
      <div className="buttons">
        <button className="primary" onClick={() => location.reload()}>Reload</button>
        <button onClick={clearOfflineCopy}>Clear the app's offline copy and reload</button>
      </div>
      <pre className="text">{messageOf(error)}</pre>
      <p className="sub">Build {__APP_VERSION__}</p>
    </section>
  );
}

// Catches a screen that fails while drawing, so the page shows the error, not nothing.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <ErrorPanel error={this.state.error} /> : this.props.children;
  }
}
