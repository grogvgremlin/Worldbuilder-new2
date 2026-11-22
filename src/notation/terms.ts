// Reading and writing lists of named references: the Equipment, Rules and Status columns,
// and anything inside square brackets.
// "Hand Weapon;Barded Warhorse(Ridden)~Mount" -> two terms; see Term in src/items/items.ts.
// Prefixes: "+" or "add:" adds to what's inherited, "-" removes, "replace~X" marks X as replaced.

import type { Term } from "../items/items";
import { pieces, splitTop } from "./split";

export function readTerms(text: string | undefined, problems: string[] = []): Term[] {
  return splitTop(text ?? "", ";").map((part) => readTerm(part, problems));
}

export function readTerm(text: string, problems: string[] = []): Term {
  let t = text.trim();
  let change: Term["change"];
  if (/^add:/i.test(t)) {
    change = "add";
    t = t.slice(4).trim();
  } else if (/^replace~/i.test(t)) {
    change = "replace";
    t = t.slice(8).trim();
  } else if (t.startsWith("+")) {
    change = "add";
    t = t.slice(1).trim();
  } else if (t.startsWith("-") && !/^-\d/.test(t)) {
    change = "remove";
    t = t.slice(1).trim();
  }
  const term: Term = { name: "" };
  for (const piece of pieces(t)) {
    if (piece.kind === "name" && term.name === "") {
      const tilde = piece.text.lastIndexOf("~");
      if (tilde > 0) {
        term.name = piece.text.slice(0, tilde).trim();
        term.as = piece.text.slice(tilde + 1).trim();
      } else term.name = piece.text;
    } else if (piece.kind === "round" && term.detail === undefined) term.detail = piece.text;
    else if (piece.kind === "as" && term.as === undefined) term.as = piece.text;
    else if (piece.kind === "square" && term.linked === undefined) term.linked = readTerms(piece.text, problems);
    else problems.push(`"${text}": can't read the part "${piece.text}"`);
  }
  if (change) term.change = change;
  return term;
}

// `style` picks how an addition is written: "rules" columns use "add:", everywhere else "+".
export function writeTerms(terms: Term[] | undefined, style: "plus" | "rules" = "plus"): string {
  return (terms ?? []).map((t) => writeTerm(t, style)).join(";");
}

export function writeTerm(term: Term, style: "plus" | "rules" = "plus"): string {
  let prefix = "";
  if (term.change === "add") prefix = style === "rules" ? "add:" : "+";
  if (term.change === "remove") prefix = "-";
  if (term.change === "replace") prefix = "replace~";
  let out = prefix + term.name;
  if (term.detail !== undefined) out += `(${term.detail})`;
  if (term.as !== undefined) out += `~${term.as}`;
  if (term.linked !== undefined) out += `[${writeTerms(term.linked, style)}]`;
  return out;
}
