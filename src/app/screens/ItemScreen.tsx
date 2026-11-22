// One item as a card that reads like the book entry, with a switch to its stored form as text.
// Every name that matched an item is a link to it. Stubs are marked "not entered yet".
// Data structure: rebuild/data-structure.md §9.

import { useState } from "react";
import YAML from "yaml";
import type { ArmyList, CompositionRule, Equipment, Item, Package, RaceProfile, SlotKind, SpecialRule, Stat, Stats, Term, Unit, UnitRow } from "../../items/items";
import { writeStat } from "../../notation/values";
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import * as words from "../words";
import { nameOf } from "./GameScreen";

type Ctx = { items: Item[]; byKey: Map<string, Item>; nav: Nav };

export function ItemScreen({ data, nav, itemKey }: { data: AppData; nav: Nav; itemKey: string }) {
  const [asText, setAsText] = useState(false);
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
        {item.reference && <> · {words.referenceText(item.reference)}</>}
      </p>
      {item.status === "stub" && <p className="stub">Not entered yet: only its name is known.</p>}
      <nav className="segments">
        <button className={!asText ? "on" : ""} onClick={() => setAsText(false)}>Card</button>
        <button className={asText ? "on" : ""} onClick={() => setAsText(true)}>Stored form</button>
      </nav>
      {asText ? <pre className="text">{YAML.stringify(item, { lineWidth: 0 })}</pre> : <Card item={item} ctx={ctx} />}
      {item.notes && <p className="hint">{item.notes}</p>}
      <UsedBy item={item} ctx={ctx} />
    </section>
  );
}

function Card({ item, ctx }: { item: Item; ctx: Ctx }) {
  switch (item.kind) {
    case "unit":
      return <UnitCard unit={item} ctx={ctx} />;
    case "equipment":
      return <EquipmentCard eq={item} ctx={ctx} />;
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
              {STATS.map((s) => <td key={s}>{writeStat(l.stats[s])}</td>)}
              {hasSave && <td>{writeStat(l.save)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Cards ----------------------------------------------------------------------------------------

function UnitCard({ unit, ctx }: { unit: Unit; ctx: Ctx }) {
  const own = unit.rows[0];
  const category = ctx.items.find((i): i is ArmyList => i.kind === "army-list" && i.entries.some((e) => e.unit === unit.key))?.entries.find((e) => e.unit === unit.key)?.category;
  const slotNames = new Map(ctx.items.filter((i): i is SlotKind => i.kind === "slot-kind").map((s) => [s.code, s.name]));
  const lines = unit.rows.map((r) => ({ name: r.name ?? (r === own ? unit.name : r.type), stats: r.stats, save: r.save }));
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
      <Field label="Command">{own.slots && (own.slots.none ? "None" : own.slots.slots.map((s) => words.slotText(s, slotNames)).join(", "))}</Field>
      <Options title="Options" row={own} ctx={ctx} />
      {own.limits && (
        <Field label="Limits">{own.limits.none ? "None (not the inherited ones)" : own.limits.limits.map(words.limitText).join("; ")}</Field>
      )}
      {unit.rows.slice(1).map((r, i) => (
        <SlotRow key={i} row={r} ctx={ctx} slotNames={slotNames} />
      ))}
    </>
  );
}

function Options({ title, row, ctx }: { title: string; row: UnitRow; ctx: Ctx }) {
  const lines = [...words.optionLines(row.equipmentOptions), ...words.optionLines(row.rulesOptions)];
  if (lines.length === 0) return null;
  const linked = [...(row.equipmentOptions?.groups ?? []), ...(row.rulesOptions?.groups ?? [])].flatMap((g) => g.options).filter((o) => o.item);
  return (
    <div className="field block">
      <span className="label">{title}</span>
      <ul className="plain">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
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

function SlotRow({ row, ctx, slotNames }: { row: UnitRow; ctx: Ctx; slotNames: Map<string, string> }) {
  const kind = row.slotCode ? slotNames.get(row.slotCode) ?? row.slotCode : row.type;
  return (
    <div className="slot">
      <h3>
        {row.name ?? kind} <span className="sub">{kind !== row.name ? kind : ""} {words.costText(row.cost)}</span>
      </h3>
      <Field label="Equipment">{row.equipment.length > 0 && <Links terms={row.equipment} ctx={ctx} />}</Field>
      <Field label="Profile">{[row.race, row.tree, row.rank].filter(Boolean).join(" · ")}</Field>
      <Options title="Options" row={row} ctx={ctx} />
      {row.limits && <Field label="Limits">{row.limits.limits.map(words.limitText).join("; ")}</Field>}
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
