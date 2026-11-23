// One item as a card that reads like the book entry, with a switch to its stored form as text.
// Every name that matched an item is a link to it. Stubs are marked "not entered yet".
// Data structure: rebuild/data-structure.md §9.

import { useState } from "react";
import YAML from "yaml";
import type { ArmyList, CompositionRule, Equipment, Item, Limit, Source, Options as OptionsCell, Package, Patch, RaceProfile, SlotKind, SpecialRule, Stat, Stats, Term, Unit, UnitRow } from "../../items/items";
import { writeStat } from "../../notation/values";
import { changeText } from "../../packages/patch-tabs";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import * as words from "../words";
import { nameOf } from "./GameScreen";

type Ctx = { items: Item[]; byKey: Map<string, Item>; nav: Nav };
type View = "entered" | "stored";

export function ItemScreen({ data, nav, itemKey }: { data: AppData; nav: Nav; itemKey: string }) {
  const [view, setView] = useState<View>("entered");
  const [, setMoved] = useState(0);
  const item = data.items.find((i) => i.key === itemKey);
  if (!item) return <p>Not on the device any more.</p>;
  const ctx: Ctx = { items: data.items, byKey: new Map(data.items.map((i) => [i.key, i])), nav };
  return (
    <section className="card">
      <h1>{item.name}</h1>
      <p className="sub">
        {item.kind.replace("-", " ")}
        {item.homePackage && (
          <>
            {" · "}
            <button className="link" onClick={() => nav.open({ name: "package", key: item.homePackage! })}>{nameOf(item.homePackage, data.items)}</button>
          </>
        )}
        {citation(item) && (
          <>
            {" · "}
            <SourceLink reference={citation(item)!} ctx={ctx} />
          </>
        )}
      </p>
      {item.status === "stub" && <p className="stub">Not entered yet: only its name is known.</p>}
      <nav className="segments">
        <button className={view === "entered" ? "on" : ""} onClick={() => setView("entered")}>As entered</button>
        <button className={view === "stored" ? "on" : ""} onClick={() => setView("stored")}>Stored form</button>
      </nav>
      {view === "stored" ? <pre className="text">{YAML.stringify(item, { lineWidth: 0 })}</pre> : <Card item={item} ctx={ctx} view={view} />}
      {item.notes && <p className="hint">{item.notes}</p>}
      <UsedBy item={item} ctx={ctx} />
      {item.homePackage && item.status !== "stub" && <MoveToBook item={item} data={data} onMoved={() => setMoved((n) => n + 1)} />}
    </section>
  );
}

function Card({ item, ctx, view }: { item: Item; ctx: Ctx; view: View }) {
  switch (item.kind) {
    case "unit":
      return <UnitCard unit={item} ctx={ctx} />;
    case "equipment":
      return <EquipmentCard eq={item} ctx={ctx} />;
    case "magic-item":
      return (
        <>
          {item.extremelyCommon && <p className="sub">Extremely common: may be taken more than once.</p>}
          <EquipmentCard eq={{ ...item, kind: "equipment", aliases: [] }} ctx={ctx} />
        </>
      );
    case "special-rule":
      return <RuleCard rule={item} />;
    case "race-profile":
      return <RaceCard race={item} ctx={ctx} />;
    case "slot-kind":
      return <SlotKindCard slot={item} ctx={ctx} />;
    case "army-list":
      return <ArmyListCard list={item} ctx={ctx} />;
    case "composition-rule":
      return <CompositionCard rule={item} />;
    case "package":
      return <PackageCard pkg={item} ctx={ctx} />;
    case "source":
      return <SourceCard source={item} ctx={ctx} />;
    case "patch":
      return <PatchCard patch={item} ctx={ctx} />;
    default:
      return null;
  }
}

// --- Pieces ---------------------------------------------------------------------------------------

function Links({ terms, ctx }: { terms: Term[] | undefined; ctx: Ctx }) {
  if (!terms?.length) return null;
  return (
    <>
      {terms.map((t, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {t.change === "remove" && "not "}
          {t.change === "replace" && "replacing "}
          <ItemLink name={words.termText(t)} itemKey={t.item} ctx={ctx} />
          {t.as && t.as !== "Unit" && <span className="sub"> ({t.as.toLowerCase()})</span>}
        </span>
      ))}
    </>
  );
}

function ItemLink({ name, itemKey, ctx }: { name: string; itemKey: string | null | undefined; ctx: Ctx }) {
  if (!itemKey || !ctx.byKey.has(itemKey)) return <span>{name}</span>;
  const stub = ctx.byKey.get(itemKey)!.status === "stub";
  return (
    <button className={"link" + (stub ? " stub-link" : "")} onClick={() => ctx.nav.open({ name: "item", key: itemKey })}>
      {name}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === undefined || children === null || children === "" || children === false) return null;
  return (
    <div className="field">
      <span className="label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

const STATS = ["M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];

// A worked-out value ("-" for none) or an entered one.
function cell(value: unknown): string {
  if (value === undefined) return "";
  if (value === "-") return "-";
  return writeStat(value as Stat);
}

function StatTable({ lines }: { lines: { name: string; stats: Stats; save?: Stat }[] }) {
  const hasSave = lines.some((l) => l.save !== undefined);
  return (
    <div className="grid-wrap">
      <table className="stats">
        <thead>
          <tr>
            <th></th>
            {STATS.map((s) => <th key={s}>{s}</th>)}
            {hasSave && <th>Save</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <th>{l.name}</th>
              {STATS.map((s) => <td key={s}>{cell(l.stats[s])}</td>)}
              {hasSave && <td>{writeStat(l.save)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Cards ----------------------------------------------------------------------------------------

// The Library shows a unit as entered: its lines as typed (a champion's change as "+1"). Working
// lines out (race, options taken, mount) is the roster card's job (owner, 22 Nov).
function UnitCard({ unit, ctx }: { unit: Unit; ctx: Ctx }) {
  const own = unit.rows[0];
  const category = ctx.items.find((i): i is ArmyList => i.kind === "army-list" && i.entries.some((e) => e.unit === unit.key))?.entries.find((e) => e.unit === unit.key)?.category;
  const slotNames = new Map(ctx.items.filter((i): i is SlotKind => i.kind === "slot-kind").map((s) => [s.code, s.name]));
  const slotCodes = new Set(unit.rows.map((r) => r.slotCode).filter((c): c is string => !!c));
  // Worked out from the race cell, the unit it's based on, the line as entered and kit; a plain
  // standard bearer has no line of its own; mounts and steeds have theirs.
  const lines = unit.rows
    .filter((r) => r === own || Object.keys(r.stats).length > 0)
    .map((r) => ({ name: r.name ?? (r === own ? unit.name : r.type), stats: r.stats, save: r.save }));
  const limits = own.limits?.limits ?? [];
  const unitLimits = limits.filter((l) => !isOptionsLimit(l) && !slotCodes.has(l.counts));
  return (
    <>
      {unit.inherits && (
        <p className="hint">
          Based on <ItemLink name={unit.inherits.name} itemKey={unit.inherits.item} ctx={ctx} />: what isn't written here comes from it.
        </p>
      )}
      <Field label="Category">{unit.class === "mount" ? "Mount (taken through another unit)" : category}</Field>
      <Field label="Troop type">{own.troopType && (own.troopType.type + (own.troopType.character ? " (character)" : ""))}</Field>
      <Field label="Size">{words.rangeText(own.size)}</Field>
      <Field label="Cost">{words.costText(own.cost)}</Field>
      <Field label="Base">{own.baseSize && (own.baseSize.text ?? `${own.baseSize.width}×${own.baseSize.depth} ${own.baseSize.unit ?? ""}`)}</Field>
      <Field label="Profile">{[own.race, own.tree, own.rank].filter(Boolean).join(" · ")}</Field>
      {lines.some((l) => Object.keys(l.stats).length > 0) && <StatTable lines={lines} />}
      <Field label="Equipment">{own.equipment.length > 0 && <Links terms={own.equipment} ctx={ctx} />}</Field>
      <Field label="Special rules">{own.rules.length > 0 && <Links terms={own.rules} ctx={ctx} />}</Field>
      <Field label="Status">{own.statuses.length > 0 && <Links terms={own.statuses} ctx={ctx} />}</Field>
      <Field label="Command">
        {own.slots &&
          (own.slots.none
            ? "None"
            : own.slots.slots.map((s) => words.slotText(s, s.fromUnitRows ? unit.rows.find((r) => r.slotCode === s.code) : undefined, slotNames)).join(", "))}
      </Field>
      <OptionsField label="Options" cell={own.equipmentOptions} limit={limits.find((l) => l.counts.toLowerCase() === "equipment options")} ctx={ctx} />
      <OptionsField label="Rules options" cell={own.rulesOptions} limit={limits.find((l) => l.counts.toLowerCase() === "rules options")} ctx={ctx} />
      {own.limits?.none && <Field label="Limit">None (not the inherited one)</Field>}
      {unitLimits.length > 0 && <Field label="Limit">{unitLimits.map((l) => (l.counts === "unit" ? words.limitAmountText(l) : words.limitText(l))).join("; ")}</Field>}
      {unit.rows.slice(1).map((r, i) => (
        <SlotRow key={i} row={r} ctx={ctx} slotNames={slotNames} limits={limits.filter((l) => l.counts === r.slotCode)} />
      ))}
    </>
  );
}

function isOptionsLimit(limit: Limit): boolean {
  return ["equipment options", "rules options"].includes(limit.counts.toLowerCase());
}

// An options cell under its heading; a limit on the whole set ("0–1 per 1,000 pts may take") heads it.
function OptionsField({ label, cell, limit, ctx }: { label: string; cell: OptionsCell | undefined; limit?: Limit; ctx: Ctx }) {
  const blocks = words.optionBlocks(cell);
  if (blocks.length === 0) return null;
  const linked = (cell?.groups ?? []).flatMap((g) => g.options).filter((o) => o.item);
  return (
    <div className="field block">
      <span className="label">{label}</span>
      {limit && <span className="sub">{words.limitAmountText(limit)} may take:</span>}
      {blocks.map((b, i) => (
        <div key={i} className="option-block">
          {b.heading && <span>{b.heading}</span>}
          <ul className="plain">{b.choices.map((c, j) => <li key={j}>{c}</li>)}</ul>
        </div>
      ))}
      {linked.length > 0 && (
        <p className="sub">
          See:{" "}
          {linked.map((o, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <ItemLink name={o.name} itemKey={o.item} ctx={ctx} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function SlotRow({ row, ctx, slotNames, limits }: { row: UnitRow; ctx: Ctx; slotNames: Map<string, string>; limits: Limit[] }) {
  const kind = row.slotCode ? slotNames.get(row.slotCode) ?? row.slotCode : row.type;
  return (
    <div className="slot">
      <h3>
        {row.name ?? kind} <span className="sub">{words.costText(row.cost)}{kind !== row.name ? ` · ${kind}` : ""}</span>
      </h3>
      <Field label="Equipment">{row.equipment.length > 0 && <Links terms={row.equipment} ctx={ctx} />}</Field>
      <Field label="Profile">{[row.race, row.tree, row.rank].filter(Boolean).join(" · ")}</Field>
      <OptionsField label="Options" cell={row.equipmentOptions} ctx={ctx} />
      <OptionsField label="Rules options" cell={row.rulesOptions} ctx={ctx} />
      {[...(row.limits?.limits ?? []), ...limits].map((l, i) => (
        <Field key={i} label="Limit">{l.of?.length ? `${l.of.join(", ")}: ${words.limitAmountText(l)}` : words.limitAmountText(l)}</Field>
      ))}
      {row.notes && <p className="hint">{row.notes}</p>}
    </div>
  );
}

function EquipmentCard({ eq, ctx }: { eq: Equipment; ctx: Ctx }) {
  const statEffects = STATS.filter((s) => eq.stats[s] !== undefined).map((s) => `${s} ${writeStat(eq.stats[s])}`);
  return (
    <>
      <Field label="Type">{eq.type}</Field>
      <Field label="Range">{eq.range}</Field>
      <Field label="Effects">{statEffects.join(", ")}</Field>
      <Field label="AP">{eq.armourPiercing}</Field>
      <Field label="Save">{writeStat(eq.save)}</Field>
      <Field label="Rules">{eq.rules.length > 0 && <Links terms={eq.rules} ctx={ctx} />}</Field>
      <Field label="Counts as">{eq.countsAs.length > 0 && <Links terms={eq.countsAs} ctx={ctx} />}</Field>
      <Field label="Also called">{eq.aliases.join(", ")}</Field>
      <Field label="Cost">{words.costText(eq.cost)}</Field>
      {eq.text && <p>{eq.text}</p>}
    </>
  );
}

function RuleCard({ rule }: { rule: SpecialRule }) {
  return (
    <>
      {rule.text && <p>{rule.text}</p>}
      <Field label="Effects (as written)">{rule.effectsAsWritten}</Field>
    </>
  );
}

function RaceCard({ race, ctx }: { race: RaceProfile; ctx: Ctx }) {
  return (
    <>
      <Field label="Race · tree · rank">{[race.race, race.tree ?? "Core", race.rank ?? "Base"].join(" · ")}</Field>
      <StatTable lines={[{ name: race.race, stats: race.stats }]} />
      <Field label="Rules">{race.rules.length > 0 && <Links terms={race.rules} ctx={ctx} />}</Field>
    </>
  );
}

function SlotKindCard({ slot, ctx }: { slot: SlotKind; ctx: Ctx }) {
  return (
    <>
      <Field label="Code">{slot.code}</Field>
      <Field label="Carries">{slot.equipment.length > 0 && <Links terms={slot.equipment} ctx={ctx} />}</Field>
      <Field label="Also called">{slot.aliases.join(", ")}</Field>
    </>
  );
}

function ArmyListCard({ list, ctx }: { list: ArmyList; ctx: Ctx }) {
  const categories = [...new Set(list.entries.map((e) => e.category))];
  return (
    <>
      {categories.map((c) => (
        <div className="field block" key={c}>
          <span className="label">{c}</span>
          <span>
            {list.entries.filter((e) => e.category === c).map((e, i) => (
              <span key={e.unit}>
                {i > 0 && ", "}
                <ItemLink name={nameOf(e.unit, ctx.items)} itemKey={e.unit} ctx={ctx} />
              </span>
            ))}
          </span>
        </div>
      ))}
      <div className="field block">
        <span className="label">Composition</span>
        <ul className="plain">
          {list.composition.map((k) => {
            const rule = ctx.byKey.get(k) as CompositionRule | undefined;
            return <li key={k}>{rule ? `${rule.name}: ${rule.limits.limits.map(words.limitText).join("; ")}` : k}</li>;
          })}
        </ul>
      </div>
    </>
  );
}

// A patch reads as its changes, each in the sheet's own words, with what it changes linked.
function PatchCard({ patch, ctx }: { patch: Patch; ctx: Ctx }) {
  return (
    <>
      <Field label="Switches off">{patch.switchesOff.join(", ")}</Field>
      <div className="field block">
        <span className="label">Changes, in order</span>
        <ul className="plain">
          {patch.changes.map((c, i) => (
            <li key={i}>
              <ItemLink name={c.target.name} itemKey={c.target.item} ctx={ctx} />
              <span className="sub"> {changeText(c).slice(changeText(c).indexOf(":") + 1)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function CompositionCard({ rule }: { rule: CompositionRule }) {
  return (
    <>
      <Field label="Category">{rule.category}</Field>
      <Field label="Limit">{rule.limits.limits.map(words.limitText).join("; ")}</Field>
    </>
  );
}

function PackageCard({ pkg, ctx }: { pkg: Package; ctx: Ctx }) {
  return (
    <p>
      <button className="link" onClick={() => ctx.nav.open({ name: "package", key: pkg.key })}>Open the package</button>
    </p>
  );
}

// Moving an item to another book (its home: the folder it downloads into). Its key doesn't change,
// so everything that names it still finds it.
function MoveToBook({ item, data, onMoved }: { item: Item; data: AppData; onMoved: () => void }) {
  const game = item.key.split(".")[0];
  const books = data.items.filter((i): i is Package => i.kind === "package" && i.game === game && !i.stubsFor && i.key !== item.homePackage);
  const move = async (to: string) => {
    if (!to) return;
    const target = books.find((b) => b.key === to)!;
    if (!confirm(`Move ${item.name} to ${target.name}?`)) return;
    await data.moveItem(item.key, to);
    onMoved();
  };
  return (
    <div className="field">
      <span className="label">Lives in</span>
      <select value="" onChange={(e) => move(e.target.value)}>
        <option value="">{nameOf(item.homePackage!, data.items)} — move to another book…</option>
        {books.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
      </select>
    </div>
  );
}

// Where an item is printed: its own reference, or for a unit its own line's.
function citation(item: Item): Item["reference"] {
  return item.reference ?? (item.kind === "unit" ? item.rows[0].reference : undefined);
}

// "Forces of Fantasy, p. 64", with the book a link to its bibliography entry when there is one.
function SourceLink({ reference, ctx }: { reference: NonNullable<Item["reference"]>; ctx: Ctx }) {
  const source = ctx.items.find((i): i is Source => i.kind === "source" && i.name === reference.source);
  return (
    <>
      {source ? <ItemLink name={reference.source} itemKey={source.key} ctx={ctx} /> : reference.source}
      {reference.page && `, p. ${reference.page}`}
    </>
  );
}

// A book (or PDF, website) and everything that cites it, by kind.
function SourceCard({ source, ctx }: { source: Source; ctx: Ctx }) {
  const citing = ctx.items.filter((i) => citation(i)?.source === source.name);
  const byKind = new Map<string, Item[]>();
  for (const i of citing) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  return (
    <>
      <Field label="Kind">{source.sourceKind}</Field>
      <Field label="By">{source.by}</Field>
      <Field label="Published">{source.published}</Field>
      <Field label="Link">{source.link && <a href={source.link}>{source.link}</a>}</Field>
      <h2>Cited by ({citing.length})</h2>
      {[...byKind].map(([kind, list]) => (
        <details key={kind} className="stub-group">
          <summary>
            {kind.replace("-", " ")} <span className="sub">{list.length}</span>
          </summary>
          <ul className="plain">
            {list.map((i) => (
              <li key={i.key}>
                <ItemLink name={i.name} itemKey={i.key} ctx={ctx} />
                {citation(i)?.page && <span className="sub"> p. {citation(i)!.page}</span>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}

// Everything that names this item.
function UsedBy({ item, ctx }: { item: Item; ctx: Ctx }) {
  const users = ctx.items.filter((other) => other.key !== item.key && JSON.stringify(other).includes(`"item":"${item.key}"`));
  if (users.length === 0) return null;
  return (
    <div className="field block">
      <span className="label">Named by</span>
      <span>
        {users.map((u, i) => (
          <span key={u.key}>
            {i > 0 && ", "}
            <ItemLink name={u.name} itemKey={u.key} ctx={ctx} />
          </span>
        ))}
      </span>
    </div>
  );
}
