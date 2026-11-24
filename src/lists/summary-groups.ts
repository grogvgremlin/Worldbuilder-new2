// Which group an item falls in on an army summary card: its label, as entered, in a column the game
// chooses (Type by default). Only when the label is blank does the game's "when blank" list apply:
// conditions on the item's own columns, first match wins, else the game's "otherwise" heading
// (owner, 24 Nov: "label driven … a condition if blank … categories very much depend on the game").
// A condition, written like a limit's filter, on the item's sheet row:
//   R            the R column has something in it
//   Not(R)       it's blank
//   R(Combat)    it says Combat (or one of A|B)
//   ;            and
//
// Pure.

import type { Game, Item } from "../items/items";
import type { Row } from "../sheets/csv";
import { writeEquipmentRow, writeMagicItemRow, writeRuleRow } from "../packages/sheet-tabs";
import { splitTop } from "../notation/split";

export type SummaryRule = { by?: string; whenBlank?: { when: string; group: string }[]; otherwise?: string };
export const SUMMARY_CARDS = ["Equipment", "Special rules", "Magic items"] as const;

// The item as its sheet row, so any column can be read by its name.
export function rowOf(item: Item): Row | null {
  if (item.kind === "equipment") return writeEquipmentRow(item);
  if (item.kind === "special-rule") return writeRuleRow(item);
  if (item.kind === "magic-item") return writeMagicItemRow(item);
  return null;
}

export function holds(row: Row, when: string): boolean {
  return splitTop(when, ";").every((part) => {
    const p = part.trim();
    const not = /^not\s*\((.*)\)$/i.exec(p);
    if (not) return !holds(row, not[1]);
    const eq = /^(.+?)\s*\((.*)\)$/.exec(p);
    if (eq) return eq[2].split("|").some((v) => (row[eq[1].trim()] ?? "").trim().toLowerCase() === v.trim().toLowerCase());
    return (row[p] ?? "").trim() !== "";
  });
}

export function groupFor(item: Item, card: string, game: Game | undefined): string {
  const rule: SummaryRule = game?.summaries?.[card] ?? {};
  const row = rowOf(item);
  const label = row?.[rule.by ?? "Type"]?.trim() ?? "";
  if (label) return label[0].toUpperCase() + label.slice(1);
  const hit = row ? (rule.whenBlank ?? []).find((w) => holds(row, w.when)) : undefined;
  return hit?.group ?? rule.otherwise ?? "Other";
}
