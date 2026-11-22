// Stored values in plain words, for the cards: "7 pts per model", "Choose one: Halberds (+1 pts per
// model) or Thrusting Spears (+1 pts per model)", "0–1 per 1,000 pts of the roster target".
// Pure: no screens here, so it can be tested.

import type { Cost, Limit, Option, OptionGroup, Options, Range, Reference, Slot, Term } from "../items/items";

export function costText(cost: Cost | undefined): string {
  if (!cost) return "";
  if (cost.points === 0) return cost.per === "model" ? "free per model" : "free";
  const amount = `${cost.adds ? "+" : ""}${cost.points} pts`;
  return cost.per === "model" ? `${amount} per model` : amount;
}

export function rangeText(range: Range | undefined): string {
  if (!range) return "";
  if (range.perModelOf) return `${range.min} per model of ${range.perModelOf}`;
  const { min, max } = range;
  if (min !== null && max !== null) return min === max ? String(min) : `${min}–${max}`;
  if (min !== null) return `${min}+`;
  if (max !== null) return `up to ${max}`;
  return "any";
}

export function referenceText(ref: Reference | undefined): string {
  if (!ref) return "";
  return ref.page ? `${ref.source}, p. ${ref.page}` : ref.source;
}

export function termText(term: Term): string {
  let out = term.name;
  if (term.detail) out += ` (${term.detail})`;
  if (term.linked?.length) out += ` [${term.linked.map(termText).join(", ")}]`;
  return out;
}

export function optionText(option: Option): string {
  const parts: string[] = [option.name + (option.detail ? ` (${option.detail})` : "")];
  if (option.replaces?.length) parts[0] += ` instead of ${option.replaces.map(termText).join(" or ")}`;
  const extras: string[] = [];
  if (option.cost) extras.push(costText(option.cost));
  if (option.budget) extras.push(`up to ${option.budget.max ?? "any"} pts`);
  if (option.count) extras.push(`${rangeText(option.count)} may take it`);
  for (const c of option.conditions ?? []) extras.push(`${c.name.toLowerCase() === "only" ? "only" : "may be"} ${c.detail ?? ""}`.trim());
  if (option.grants?.length) extras.push("gives " + option.grants.map(termText).join(", "));
  return extras.length ? `${parts[0]} (${extras.join("; ")})` : parts[0];
}

// An options cell as blocks: a heading ("Choose one (required):") and the choices under it.
export type OptionBlock = { heading: string | null; choices: string[] };

export function optionBlocks(cell: Options | undefined): OptionBlock[] {
  if (!cell) return [];
  const blocks: OptionBlock[] = [];
  if (cell.removeAllInherited) blocks.push({ heading: null, choices: ["None of the inherited options"] });
  for (const t of cell.removeInherited ?? []) blocks.push({ heading: null, choices: [`Not ${termText(t)} (inherited)`] });
  for (const group of cell.groups) {
    const block = groupBlock(group);
    const last = blocks[blocks.length - 1];
    // Single options one after another read as one list.
    if (last && last.heading === null && block.heading === null) last.choices.push(...block.choices);
    else blocks.push(block);
  }
  return blocks;
}

function groupBlock(group: OptionGroup): OptionBlock {
  const choices = group.options.map(optionText);
  if (choices.length === 1) return { heading: group.required ? "Required:" : null, choices };
  return { heading: `Choose one${group.required ? " (required)" : ""}:`, choices: choices.map((c, i) => (i < choices.length - 1 ? `${c} or` : c)) };
}

export function limitText(limit: Limit): string {
  let what = limit.counts;
  if (limit.of?.length) what += ` (${limit.of.join(", ")})`;
  if (limit.where) what += ` [${limit.where}]`;
  return `${what}: ${limitAmountText(limit)}`;
}

// Only how many and per what: "0–1 per 1,000 pts of the roster target".
export function limitAmountText(limit: Limit): string {  const r = limit.amount;
  const unit = limit.percent ? "%" : "";
  let amount: string;
  if (r.min !== null && r.max !== null) amount = r.min === r.max ? `${r.min}${unit}` : `${r.min}–${r.max}${unit}`;
  else if (r.min !== null) amount = `at least ${r.min}${unit}`;
  else if (r.max !== null) amount = `up to ${r.max}${unit}`;
  else amount = "any";
  let per = "";
  if (limit.perPoints) per = ` per ${limit.perPoints.toLocaleString("en-GB")} pts`;
  if (limit.basis) per += ` of the ${limit.basis}`;
  return `${amount}${per}`;
}

// A command slot by its own name and cost: "Preceptor +6 pts". A slot written "C(slots)" takes both
// from the unit's own row for C; otherwise the slot kind's name and the cost written on the slot.
export function slotText(slot: Slot, ownRow: { name?: string; cost?: Cost } | undefined, slotNames: Map<string, string>): string {
  const name = ownRow?.name ?? slotNames.get(slot.code) ?? slot.code;
  const cost = costText(ownRow?.cost ?? slot.cost);
  return cost ? `${name} ${cost}` : name;
}
