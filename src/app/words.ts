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
  if (option.addsToInherited) extras.push("as well as the inherited options");
  return extras.length ? `${parts[0]} (${extras.join("; ")})` : parts[0];
}

export function groupText(group: OptionGroup): string {
  if (group.options.length === 1) return optionText(group.options[0]) + (group.required ? " — required" : "");
  return `Choose one${group.required ? " (required)" : ""}: ${group.options.map(optionText).join(" or ")}`;
}

// Every line an options cell reads as, removals first.
export function optionLines(cell: Options | undefined): string[] {
  if (!cell) return [];
  const lines: string[] = [];
  if (cell.removeAllInherited) lines.push("None of the inherited options");
  for (const t of cell.removeInherited ?? []) lines.push(`Not ${termText(t)} (inherited)`);
  for (const group of cell.groups) lines.push(groupText(group));
  return lines;
}

export function limitText(limit: Limit): string {
  let what = limit.counts;
  if (limit.of?.length) what += ` (${limit.of.join(", ")})`;
  if (limit.where) what += ` [${limit.where}]`;
  const r = limit.amount;
  const unit = limit.percent ? "%" : "";
  let amount: string;
  if (r.min !== null && r.max !== null) amount = r.min === r.max ? `${r.min}${unit}` : `${r.min}–${r.max}${unit}`;
  else if (r.min !== null) amount = `at least ${r.min}${unit}`;
  else if (r.max !== null) amount = `up to ${r.max}${unit}`;
  else amount = "any";
  let per = "";
  if (limit.perPoints) per = ` per ${limit.perPoints.toLocaleString("en-GB")} pts`;
  if (limit.basis) per += `${limit.perPoints ? " of the" : " of the"} ${limit.basis}`;
  return `${what}: ${amount}${per}`;
}

export function slotText(slot: Slot, slotNames: Map<string, string>): string {
  const name = slotNames.get(slot.code) ?? slot.code;
  if (slot.fromUnitRows) return name;
  const extras = [costText(slot.cost), slot.count ? rangeText(slot.count) : "", slot.type ?? ""].filter((x) => x !== "");
  return extras.length ? `${name} (${extras.join(", ")})` : name;
}
