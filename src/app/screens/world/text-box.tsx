// A text box that saves when you leave it (or press Enter on one line), not on every key, so a
// long entry isn't written to the device letter by letter.
import { useEffect, useState } from "react";

export function TextBox({ value, onSave, placeholder, className, multiline }: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const done = () => text.trim() !== value.trim() && onSave(text.trim());
  if (multiline) return <textarea className={className} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={done} />;
  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

// A field's value: a dropdown when its kind lists allowed values (owner, 27 Nov), else a text box. A
// value from before the list (not on it) stays, shown as such, until changed.
export function ValueBox({ value, choices, placeholder, onSave }: { value: string; choices?: string[]; placeholder?: string; onSave: (v: string) => void }) {
  if (!choices?.length) return <TextBox className="field-box" value={value} placeholder={placeholder} onSave={onSave} />;
  return (
    <select className="field-box" value={value} onChange={(e) => onSave(e.target.value)}>
      <option value="">{placeholder ? `(${placeholder})` : "(none)"}</option>
      {value && !choices.includes(value) && <option value={value}>{value} (not on the list)</option>}
      {choices.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

// A field's allowed values, typed with commas between: "paved, mud, track". Blank: any value.
export function ChoicesBox({ choices, onSave }: { choices?: string[]; onSave: (choices: string[] | undefined) => void }) {
  return (
    <TextBox
      className="field-box choices-box"
      value={(choices ?? []).join(", ")}
      placeholder="allowed values (a, b, c)"
      onSave={(v) => {
        const list = [...new Set(v.split(",").map((c) => c.trim()).filter(Boolean))];
        onSave(list.length ? list : undefined);
      }}
    />
  );
}
