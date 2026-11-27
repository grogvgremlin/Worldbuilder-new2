// Join two world items, ends first (owner, 26–27 Nov), on the map, the Diagram and the item card.
// A then B, in the order they were tapped (Swap turns it round). Every link kind is offered: those
// whose ends fit first, those that fit only the other way round next (joining turns them round), then
// the rest, greyed with the reason; a Warn-only misfit can still be picked, and is flagged.
// Design: spec/authoring/authoring-v2.md §1.1; design/world-structure.md §3. Core: src/world/links.ts.
import { useState } from "react";
import type { Item } from "../../../items/items";
import { join, offersFor, type Offer } from "../../../world/links";
import { thingsIn } from "../../../world/world";
import type { AppData } from "../../app-data";

export function JoinPopup({ data, world, ends, apply, onClose }: { data: AppData; world: string; ends: [string, string]; apply: (items: Item[], link?: string) => Promise<void>; onClose: () => void }) {
  const [[from, to], setEnds] = useState(ends);
  const name = (key: string) => thingsIn(data.items, world).find((t) => t.key === key)?.name ?? key;
  const offers = offersFor(data.items, world, from, to);
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
        <h2>Join</h2>
        <p className="join-ends">
          <b>{name(from)}</b> → <b>{name(to)}</b> <button className="link" onClick={() => setEnds([to, from])}>⇄ Swap</button>
        </p>
        <JoinChoices data={data} offers={offers} from={name(from)} to={name(to)} onPick={pick} />
      </div>
    </div>
  );
}

// The link kinds offered, as rows: each reads as a sentence ("Nuln in Averland"), with what joining
// also does, or why it can't.
export function JoinChoices({ offers, from, to, onPick }: { data: AppData; offers: Offer[]; from: string; to: string; onPick: (offer: Offer) => void }) {
  if (offers.length === 0) return <p className="sub">This world has no link kinds yet (World → Kinds).</p>;
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
