// Readable keys, and matching names the way an upload writes them.
// Data structure: rebuild/data-structure.md §2. A key is game.kind.name: tow.unit.empire-knights.
// Keys are never typed on upload; names are matched instead.

// "Empire Knights" -> "empire-knights"; "Clouds of Soot & Smoke" -> "clouds-of-soot-smoke"
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'"*]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A name as it's matched: case, spacing, quotes and a trailing * ignored.
export function matchName(text: string): string {
  return text
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\*+$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const KIND_IN_KEY: Record<string, string> = {
  unit: "unit",
  equipment: "equipment",
  "special-rule": "rule",
  "slot-kind": "slot",
  "army-list": "army-list",
  "composition-rule": "composition",
  "race-profile": "race",
  source: "source",
};

export function itemKey(game: string, kind: string, ...nameParts: string[]): string {
  return [game, KIND_IN_KEY[kind] ?? kind, ...nameParts.map(slug)].join(".");
}
