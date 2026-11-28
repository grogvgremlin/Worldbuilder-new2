// Connect two world items, ends first (owner, 26–28 Nov), on the map, the Diagram and the item card.
// A then B, in the order they were tapped (Swap turns it round). The world's connections are offered
// (trees are Move inside, groups are Group: owner, 28 Nov): those whose ends fit first, those that fit
// only the other way round next (connecting turns them round), then the rest, greyed with the reason; a
// Warn-only misfit can still be picked, and is flagged. Or a new connection, made to fit these two.
// Design: spec/authoring/authoring-v2.md §1.1; design/world-structure.md §3. Core: src/world/links.ts.
import { useState } from "react";
import type { Item } from "../../../items/items";
import { join, newConnectionKindFor, offersFor, type Offer } from "../../../world/links";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";

export function JoinPopup({ data, world, ends, apply, onClose }: { data: AppData; world: string; ends: [string, string]; apply: (items: Item[], link?: string) => Promise<void>; onClose: () => void }) {
  const [[from, to], setEnds] = useState(ends);
  const name = (key: string) => thingsIn(data.items, world).find((t) => t.key === key)?.name ?? key;
  const offers = offersFor(data.items, world, from, to, true);
  const pick = async (offer: Offer) => {
    const result = join(data.items, world, from, offer.kind.key, to);
    if (result.problem) return alert(result.problem);
    await apply(result.items, result.link);
    onClose();
  };
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup join-popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>Connect</h2>
        <p className="join-ends">
          <b>{name(from)}</b> → <b>{name(to)}</b> <button className="link" onClick={() => setEnds([to, from])}>⇄ Swap</button>
        </p>
        <JoinChoices data={data} offers={offers} from={name(from)} to={name(to)} onPick={pick} />
        <NewConnection data={data} world={world} from={from} to={to} onMade={async (items, link) => (await apply(items, link), onClose())} />
      </div>
    </div>
  );
}

// The link kinds offered, as rows: each reads as a sentence ("Nuln in Averland"), with what joining
// also does, or why it can't.
export function JoinChoices({ offers, from, to, onPick }: { data: AppData; offers: Offer[]; from: string; to: string; onPick: (offer: Offer) => void }) {
  if (offers.length === 0) return <p className="sub">No connections yet: make one below, or under Kinds → Connections.</p>;
  return (
    <ul className="list join-choices">
      {offers.map((o) => {
        const [a, b] = o.fits === "reversed" ? [to, from] : [from, to];
        const sub = [o.fits === "reversed" ? "turned round to fit" : "", o.note ?? "", o.fits === "no" || !o.canPick ? o.why ?? "" : ""].filter(Boolean).join(" · ");
        return (
          <li key={o.kind.key} className={o.canPick ? (o.fits === "no" ? "warn-choice" : "") : "greyed"}>
            <button disabled={!o.canPick} onClick={() => onPick(o)}>
              <span className="title">{a} <b>{o.kind.name}</b> {b}{o.fits === "no" && o.canPick ? " ⚠" : ""}</span>
              <span className="sub">{[kindWord(o), sub].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function kindWord(o: Offer): string {
  if (o.kind.hierarchy === "one parent") return "tree";
  if (o.kind.hierarchy === "several parents") return "group";
  return o.kind.direction === "both ways" ? "connection, both ways" : "connection, one way";
}

// A new connection kind, its ends taken from these two items' kinds, and these two connected by it.
export function NewConnection({ data, world, from, to, onMade }: { data: AppData; world: string; from: string; to: string; onMade: (items: Item[], link?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const make = async () => {
    if (!name.trim()) return;
    const kind = newConnectionKindFor(data.items, world, name, from, to);
    const result = join([...data.items, kind], world, from, kind.key, to);
    if (result.problem) return alert(result.problem);
    await onMade(result.items, result.link);
    setName("");
  };
  return (
    <div className="inline-add">
      <input className="filter" placeholder="Or a new connection (e.g. road, feud with)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && make()} />
      <button onClick={make}>Make</button>
    </div>
  );
}
