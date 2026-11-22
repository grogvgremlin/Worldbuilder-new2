// One preset of a game: its name, what it says about itself, and what it switches on. Saved as you go.
import { useState } from "react";
import type { Game, GamePreset } from "../../../items/items";
import { compositionSets, gamePackages, withPreset } from "../../../context/game-config";
import type { AppData } from "../../app-data";
import type { Nav } from "../../App";

export function PresetScreen({ data, nav, gameKey, index }: { data: AppData; nav: Nav; gameKey: string; index: number }) {
  const [, setChanged] = useState(0);
  const game = data.items.find((i): i is Game => i.kind === "game" && i.key === gameKey);
  if (!game) return <p>Not on the device any more.</p>;
  const preset: GamePreset = game.presets?.[index] ?? { name: "New preset" };
  const save = async (next: GamePreset | null) => {
    await data.putItem(withPreset(game, index, next));
    setChanged((n) => n + 1);
    if (next === null) nav.back();
  };
  const packages = gamePackages(game, data.items);
  const byLayer = (layer: string) => packages.filter((p) => p.layer === layer);
  const names = (field: "books" | "faqs" | "house" | "composition") => preset[field] ?? [];
  const toggle = (field: "books" | "faqs" | "house" | "composition", name: string) => {
    const list = names(field);
    const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
    save({ ...preset, [field]: next.length ? next : undefined });
  };
  const missing = [...names("books"), ...names("faqs"), ...names("house"), ...names("composition")].filter((n) => !packages.some((p) => p.name === n));

  const checks = (field: "books" | "faqs" | "house" | "composition", options: { name: string }[]) =>
    options.map((p) => (
      <label key={p.name} className="choice">
        <input type="checkbox" checked={names(field).includes(p.name)} onChange={() => toggle(field, p.name)} />
        <span>{p.name}</span>
      </label>
    ));

  return (
    <section className="card">
      <input className="title-input" value={preset.name} onChange={(e) => save({ ...preset, name: e.target.value })} aria-label="Preset name" />
      <input className="filter" placeholder="What it's for" value={preset.about ?? ""} onChange={(e) => save({ ...preset, about: e.target.value || undefined })} />
      <p className="sub">{game.name}: the core is always on.</p>

      <h2>Books</h2>
      {checks("books", byLayer("book").filter((p) => !p.partOf))}
      <label className="choice">
        <input type="checkbox" checked={preset.armies === "all"} onChange={() => save({ ...preset, armies: preset.armies === "all" ? undefined : "all" })} />
        <span>and every army in those books</span>
      </label>
      <h3>Single armies</h3>
      {checks("books", byLayer("book").filter((p) => p.partOf))}
      <h2>FAQs</h2>
      {byLayer("faq").length ? checks("faqs", byLayer("faq")) : <p className="sub">None loaded. (A book brings its latest FAQ anyway.)</p>}
      <h2>House rules</h2>
      {byLayer("house").length ? checks("house", byLayer("house")) : <p className="sub">None loaded.</p>}
      <h2>Composition</h2>
      {checks("composition", compositionSets(game, data.items))}
      {missing.length > 0 && <p className="hint">Named but not loaded (left out when used): {missing.join(", ")}</p>}

      <div className="buttons">
        <button onClick={() => nav.back()}>Done</button>
        {index < (game.presets ?? []).length && (
          <button className="danger" onClick={() => confirm(`Remove the preset ${preset.name}?`) && save(null)}>Remove preset</button>
        )}
      </div>
    </section>
  );
}
