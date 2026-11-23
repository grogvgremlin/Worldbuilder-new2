// A number box that can be cleared while typing: the text is kept as typed and saved only when it's
// a whole number at or above `min`; leaving the box puts back the saved number if the text isn't one.
// (owner, 23 Nov: going from 10 to 25 meant fighting a box that wouldn't go below 1.)
import { useEffect, useState } from "react";

export function NumberBox({ value, min, onChange }: { value: number; min: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const read = (t: string) => (/^\d+$/.test(t.trim()) && Number(t) >= min ? Number(t) : null);
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const n = read(e.target.value);
        if (n !== null && n !== value) onChange(n);
      }}
      onBlur={() => read(text) === null && setText(String(value))}
    />
  );
}
