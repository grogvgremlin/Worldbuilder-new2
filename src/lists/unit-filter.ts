// The filter in a limit's square brackets: which units it counts. Written by the owner in the sheet,
// so it's read here rather than coded per rule (owner, 23 Nov: "general not specific coding").
//   units[not Character; Troop Type not Swarm,War Beasts,War Machine]
//   units[Not(Character);Not(Troop Type(Swarm,War Beasts,War Machine))]   (the same, in bracket form)
//   General[Character]
// Parts separated by ";" must all hold. A part is one of:
//   Character                 a character
//   Troop Type(A,B) / Troop Type A,B         its troop type is one of these
//   Category(A,B) / Category A,B             its army category is one of these (Core, Special …)
//   Unit(A,B) / Unit A,B                     it's one of these entries, by name
//   Rule(A,B) / Rule A,B                     it has one of these special rules
// and any of them can be negated: "not X", "X not A,B" or "Not(X)".
// Lists inside may use "," or "|". Design: build-log Part B decision 15 (limits: what~amount~per).
//
// Pure.

import { matchName } from "../items/keys";
import { splitTop } from "../notation/split";

// What a filter needs to know about a unit.
export type Filterable = { name: string; character: boolean; troopType?: string; category: string; rules: string[] };

type Test = { field: "character" | "troop type" | "category" | "unit" | "rule"; values: string[]; not: boolean };

export type Filter = { tests: Test[]; problems: string[] };

const FIELDS: Record<string, Test["field"]> = { character: "character", "troop type": "troop type", category: "category", unit: "unit", rule: "rule" };

export function readFilter(where: string | undefined): Filter {
  const filter: Filter = { tests: [], problems: [] };
  for (const part of splitTop(where ?? "", ";").map((p) => p.trim()).filter(Boolean)) {
    const test = readPart(part);
    if (test) filter.tests.push(test);
    else filter.problems.push(`can't read “${part}” in a limit's filter (e.g. Not(Character); Troop Type(Infantry))`);
  }
  return filter;
}

function readPart(text: string, not = false): Test | null {
  const t = text.trim();
  // Not(X)
  const wrapped = /^not\s*\((.*)\)$/i.exec(t);
  if (wrapped) return readPart(wrapped[1], !not);
  // not X
  const prefixed = /^not\s+(.*)$/i.exec(t);
  if (prefixed) return readPart(prefixed[1], !not);
  // Field(A,B)
  const bracketed = /^([a-z ]+?)\s*\((.*)\)$/i.exec(t);
  if (bracketed && FIELDS[bracketed[1].trim().toLowerCase()]) return { field: FIELDS[bracketed[1].trim().toLowerCase()], values: list(bracketed[2]), not };
  // Field not A,B  /  Field A,B  /  Field
  for (const [word, field] of Object.entries(FIELDS)) {
    if (t.toLowerCase() === word) return { field, values: [], not };
    if (t.toLowerCase().startsWith(word + " ")) {
      let rest = t.slice(word.length).trim();
      let negated = not;
      if (/^not\s+/i.test(rest)) (rest = rest.replace(/^not\s+/i, ""), (negated = !negated));
      return { field, values: list(rest), not: negated };
    }
  }
  return null;
}

function list(text: string): string[] {
  return text.split(/[,|]/).map((v) => v.trim()).filter(Boolean);
}

export function passesFilter(unit: Filterable, filter: Filter): boolean {
  return filter.tests.every((test) => holds(unit, test) !== test.not);
}

function holds(unit: Filterable, test: Test): boolean {
  const among = (value: string | undefined) => value !== undefined && test.values.some((v) => matchName(v) === matchName(value));
  if (test.field === "character") return unit.character;
  if (test.field === "troop type") return among(unit.troopType);
  if (test.field === "category") return among(unit.category);
  if (test.field === "unit") return among(unit.name);
  return unit.rules.some((r) => among(r));
}
