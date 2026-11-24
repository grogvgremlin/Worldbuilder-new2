// Reading and writing the Slots and Unit Limit cells.
// Slots (format/schemae.csv): "C(slots)" = the unit's own C row; "SB(0-1;upgrade;+5)" = count; type; cost;
//   "Crew(3;crew;0)"; "None" = no slots, overriding inherited ones.
// Limits (build-log Part B decision 15): what~amount~per, e.g.
//   "unit~0-1~1000 roster target", "points~-50%~roster target", "unit(Great Cannon,Mortar)~0-3~1000 roster target",
//   "units[not Character; Troop Type not Swarm]~3-~army"; several joined by ";"; "None".

import type { Limit, Limits, Slot, Slots } from "../items/items";
import { pieces, splitTop } from "./split";
import { readCost, readRange, writeCost, writeRange, type Problems } from "./values";

// --- Slots --------------------------------------------------------------------------------------

export function readSlots(text: string | undefined, problems: Problems): Slots | undefined {
  const parts = splitTop(text ?? "", ";");
  if (parts.length === 0) return undefined;
  const cell: Slots = { slots: [] };
  for (const part of parts) {
    if (/^none$/i.test(part)) {
      cell.none = true;
      continue;
    }
    // A section: "Command(C(slots);SB(slots);M(0-1;upgrade;+6))" groups slots under a heading of the
    // owner's naming (owner, 24 Nov); a slot's own brackets never hold brackets, a section's do.
    const [head, round] = pieces(part);
    if (round && round.text.includes("(")) {
      for (const inner of splitTop(round.text, ";")) cell.slots.push({ ...readSlot(inner, problems), section: head.text });
      continue;
    }
    cell.slots.push(readSlot(part, problems));
  }
  return cell;
}

function readSlot(part: string, problems: Problems): Slot {
  const [head, round] = pieces(part);
  const slot: Slot = { code: head?.text ?? part };
  const args = round ? splitTop(round.text, ";") : [];
  if (args.length === 1 && /^slots$/i.test(args[0])) slot.fromUnitRows = true;
  else {
    const [count, type, cost] = args;
    const c = readRange(count, problems);
    if (c) slot.count = c;
    if (type) slot.type = type;
    const k = readCost(cost, problems);
    if (k) slot.cost = k;
  }
  return slot;
}

export function writeSlots(cell: Slots | undefined): string {
  if (!cell) return "";
  const parts: string[] = cell.none ? ["None"] : [];
  const one = (slot: Slot) => (slot.fromUnitRows ? `${slot.code}(slots)` : `${slot.code}(${[writeRange(slot.count), slot.type ?? "", writeCost(slot.cost)].join(";")})`);
  // Slots in a section are written inside it, sections in the order they first appear.
  const sections: string[] = [];
  for (const slot of cell.slots) {
    if (!slot.section) parts.push(one(slot));
    else if (!sections.includes(slot.section)) {
      sections.push(slot.section);
      parts.push(`${slot.section}(${cell.slots.filter((x) => x.section === slot.section).map(one).join(";")})`);
    }
  }
  return parts.join(";");
}

// --- Limits -------------------------------------------------------------------------------------

export function readLimits(text: string | undefined, problems: Problems): Limits | undefined {
  const parts = splitTop(text ?? "", ";");
  if (parts.length === 0) return undefined;
  const cell: Limits = { limits: [] };
  for (const part of parts) {
    if (/^none$/i.test(part)) {
      cell.none = true;
      continue;
    }
    const limit = readLimit(part, problems);
    if (limit) cell.limits.push(limit);
  }
  return cell;
}

function readLimit(text: string, problems: Problems): Limit | undefined {
  const [what, amountText, perText] = splitTop(text, "~");
  if (!what || !amountText) {
    problems.push(`limit "${text}": expected what~amount~per`);
    return undefined;
  }
  const percent = amountText.includes("%");
  const amount = readRange(amountText.replace(/%/g, ""), problems);
  if (!amount) return undefined;
  const limit: Limit = { counts: "", amount, percent };
  for (const piece of pieces(what)) {
    if (piece.kind === "name") limit.counts = piece.text;
    if (piece.kind === "round") limit.of = piece.text.split(",").map((s) => s.trim());
    if (piece.kind === "square") limit.where = piece.text;
  }
  if (perText) {
    const m = /^(\d+)\s*(.*)$/.exec(perText.trim());
    if (m) limit.perPoints = Number(m[1]);
    const basis = (m ? m[2] : perText).trim();
    if (basis) limit.basis = basis;
  }
  return limit;
}

export function writeLimits(cell: Limits | undefined): string {
  if (!cell) return "";
  const parts: string[] = cell.none ? ["None"] : [];
  for (const limit of cell.limits) parts.push(writeLimit(limit));
  return parts.join(";");
}

function writeLimit(limit: Limit): string {
  let what = limit.counts;
  if (limit.of) what += `(${limit.of.join(",")})`;
  if (limit.where !== undefined) what += `[${limit.where}]`;
  const r = limit.amount;
  let amount = writeRange(r);
  if (limit.percent) {
    amount = r.min !== null && r.min === r.max ? `${r.min}%` : (r.min === null ? "" : `${r.min}%`) + "-" + (r.max === null ? "" : `${r.max}%`);
  }
  const per = [limit.perPoints, limit.basis].filter((x) => x !== undefined).join(" ");
  return per === "" ? `${what}~${amount}` : `${what}~${amount}~${per}`;
}
