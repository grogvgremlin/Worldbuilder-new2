// Splitting the owner's cell notation into its parts.
// The notation (format/glossary.csv in the data repo): `;` separates, `()` holds detail,
// `[]` holds linked things, `~` qualifies. Separators inside brackets don't count.

// Splits at a separator, but only outside brackets.
// splitTop("A(x;y);B", ";") -> ["A(x;y)", "B"]
export function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    current += ch;
    i++;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

// The text inside the bracket that opens at `start`, and the index just after it closes.
// insideBracket("A(b(c))d", 1) -> { inner: "b(c)", end: 7 }
export function insideBracket(text: string, start: number): { inner: string; end: number } {
  const open = text[start];
  const close = open === "(" ? ")" : "]";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(" || text[i] === "[") depth++;
    if (text[i] === ")" || text[i] === "]") depth--;
    if (depth === 0 && text[i] === close) return { inner: text.slice(start + 1, i), end: i + 1 };
  }
  return { inner: text.slice(start + 1), end: text.length };
}

// Breaks "Name(a)(b)~As[c]" into its pieces, in the order they're written.
// Each piece is { kind: "name" | "round" | "square" | "as", text }.
export type Piece = { kind: "name" | "round" | "square" | "as"; text: string };

export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let i = 0;
  let name = "";
  while (i < text.length) {
    const ch = text[i];
    if (ch === "(" || ch === "[") {
      if (name.trim() !== "") out.push({ kind: "name", text: name.trim() });
      name = "";
      const { inner, end } = insideBracket(text, i);
      out.push({ kind: ch === "(" ? "round" : "square", text: inner });
      i = end;
      continue;
    }
    if (ch === "~" && out.length > 0 && name.trim() === "") {
      // "~As" after brackets: read up to the next bracket
      let j = i + 1;
      while (j < text.length && text[j] !== "(" && text[j] !== "[") j++;
      out.push({ kind: "as", text: text.slice(i + 1, j).trim() });
      i = j;
      continue;
    }
    name += ch;
    i++;
  }
  if (name.trim() !== "") out.push({ kind: "name", text: name.trim() });
  return out;
}
