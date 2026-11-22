// Reading and writing single-value cells: costs, sizes, stats, references, base sizes, troop types.
// Each `read…` turns a cell into a stored value (src/items/items.ts) or a problem;
// each `write…` turns it back into the cell. Blank cells read as undefined.
// Notation: format/schemae.csv and format/glossary.csv in the data repo ("~pi" = per item / model,
// "10-" = 10 or more, "-10" = 10 or less, "-" = no such stat, "(+1)" = given to the rider).

import type { Cost, Range, Reference, Stat, Term } from "../items/items";
import { readTerms, writeTerms } from "./terms";
import { insideBracket } from "./split";

// A problem found while reading a cell. Reading never stops: the caller collects these.
export type Problems = string[];

function clean(text: string | undefined): string {
  return (text ?? "").trim();
}

// --- Cost ---------------------------------------------------------------------------------------

export function readCost(text: string | undefined, problems: Problems): Cost | undefined {
  const t = clean(text);
  if (t === "") return undefined;
  const match = /^([+-]?)(\d+(?:\.\d+)?)\s*(~\s*pi)?$/i.exec(t);
  if (!match) {
    problems.push(`can't read the cost "${t}" (e.g. 21~pi, +6, 90)`);
    return undefined;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return { points: sign * Number(match[2]), per: match[3] ? "model" : "unit", adds: match[1] === "+" };
}

export function writeCost(cost: Cost | undefined): string {
  if (!cost) return "";
  const sign = cost.adds && cost.points >= 0 ? "+" : "";
  return sign + cost.points + (cost.per === "model" ? "~pi" : "");
}

// --- Range --------------------------------------------------------------------------------------

export function readRange(text: string | undefined, problems: Problems): Range | undefined {
  const t = clean(text).replace(/\s+/g, " ");
  if (t === "") return undefined;
  const per = /^(\d+) per \((.+)\)$/i.exec(t);
  if (per) return { min: Number(per[1]), max: Number(per[1]), perModelOf: per[2].trim() };
  const compact = t.replace(/\s+/g, "");
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)$/.exec(compact))) return { min: Number(m[1]), max: Number(m[1]) };
  if ((m = /^(\d+)-$/.exec(compact)) || (m = /^>=(\d+)$/.exec(compact))) return { min: Number(m[1]), max: null };
  if ((m = /^>(\d+)$/.exec(compact))) return { min: Number(m[1]) + 1, max: null };
  if ((m = /^-(\d+)$/.exec(compact)) || (m = /^<=(\d+)$/.exec(compact))) return { min: null, max: Number(m[1]) };
  if ((m = /^<(\d+)$/.exec(compact))) return { min: null, max: Number(m[1]) - 1 };
  if ((m = /^(\d+)-(\d+)$/.exec(compact))) return { min: Number(m[1]), max: Number(m[2]) };
  if (compact === "-") return { min: null, max: null }; // "0- total": no limit
  problems.push(`can't read the size "${t}" (e.g. 10-, 0-1, 2-12, >=10)`);
  return undefined;
}

export function writeRange(range: Range | undefined): string {
  if (!range) return "";
  if (range.perModelOf) return `${range.min} per (${range.perModelOf})`;
  const { min, max } = range;
  if (min !== null && max !== null && min === max) return String(min);
  return (min === null ? "" : String(min)) + "-" + (max === null ? "" : String(max));
}

// --- Stat ---------------------------------------------------------------------------------------

export function readStat(text: string | undefined): Stat | undefined {
  let t = clean(text);
  if (t === "") return undefined;
  // Conditions written after the value in square brackets: "+2 [Only(Charging)]".
  let when: Term[] | undefined;
  const open = t.indexOf("[");
  if (open > 0 && t.endsWith("]")) {
    when = readTerms(insideBracket(t, open).inner);
    t = t.slice(0, open).trim();
  }
  const stat = readPlainStat(t);
  if (!when) return stat;
  return typeof stat === "number" ? { value: stat, when } : { ...stat, when };
}

function readPlainStat(t: string): Stat {
  if (t === "-" || t === "–") return { none: true };
  let m: RegExpExecArray | null;
  if ((m = /^\(([+-]\d+)\)$/.exec(t))) return { riderChange: Number(m[1]) };
  if ((m = /^([+-]\d+)$/.exec(t))) return { change: Number(m[1]) };
  if ((m = /^(\d+)\+$/.exec(t))) return { target: Number(m[1]) };
  if ((m = /^(\d+)$/.exec(t))) return Number(m[1]);
  return { text: t };
}

export function writeStat(stat: Stat | undefined): string {
  if (stat === undefined) return "";
  if (typeof stat === "number") return String(stat);
  let out = "";
  if (stat.none) out = "-";
  else if (stat.riderChange !== undefined) out = `(${signed(stat.riderChange)})`;
  else if (stat.change !== undefined) out = signed(stat.change);
  else if (stat.target !== undefined) out = `${stat.target}+`;
  else if (stat.value !== undefined) out = String(stat.value);
  else if (stat.text !== undefined) out = stat.text;
  if (stat.when) out += ` [${writeTerms(stat.when)}]`;
  return out;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

// --- Reference: "Forces of Fantasy;48" --------------------------------------------------------

export function readReference(text: string | undefined): Reference | undefined {
  const t = clean(text);
  if (t === "") return undefined;
  const at = t.lastIndexOf(";");
  if (at < 0) return { source: t };
  return { source: t.slice(0, at).trim(), page: t.slice(at + 1).trim() };
}

export function writeReference(ref: Reference | undefined): string {
  if (!ref) return "";
  return ref.page === undefined ? ref.source : `${ref.source};${ref.page}`;
}

// --- Base size: "25*25(mm)" -----------------------------------------------------------------

export type BaseSize = { width?: number; depth?: number; unit?: string; text?: string };

export function readBaseSize(text: string | undefined): BaseSize | undefined {
  const t = clean(text);
  if (t === "") return undefined;
  const m = /^(\d+)\s*\*\s*(\d+)\s*(?:\((\w+)\))?$/.exec(t);
  if (!m) return { text: t };
  const size: BaseSize = { width: Number(m[1]), depth: Number(m[2]) };
  if (m[3]) size.unit = m[3];
  return size;
}

export function writeBaseSize(size: BaseSize | undefined): string {
  if (!size) return "";
  if (size.text !== undefined) return size.text;
  return `${size.width}*${size.depth}` + (size.unit ? `(${size.unit})` : "");
}

// --- Troop type: "Regular Infantry (Character)" -----------------------------------------------

export function readTroopType(text: string | undefined): { type: string; character: boolean } | undefined {
  const t = clean(text);
  if (t === "") return undefined;
  const m = /^(.*?)\s*\(Character\)$/i.exec(t);
  return m ? { type: m[1], character: true } : { type: t, character: false };
}

export function writeTroopType(tt: { type: string; character: boolean } | undefined): string {
  if (!tt) return "";
  return tt.character ? `${tt.type} (Character)` : tt.type;
}

// --- Plain lists: "Sword,Axe" ------------------------------------------------------------------

export function readNameList(text: string | undefined): string[] {
  return clean(text)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function writeNameList(names: string[]): string {
  return names.join(",");
}

export function readText(text: string | undefined): string | undefined {
  const t = clean(text);
  return t === "" ? undefined : t;
}
