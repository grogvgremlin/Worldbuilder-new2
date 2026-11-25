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
