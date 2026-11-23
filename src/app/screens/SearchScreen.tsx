// Search as you type, over everything on the device: names, keys, aliases and types (owner, 23 Nov).
// Results show under the box as you type; tap one to open it. Logic: src/library/search.ts.
import { useState } from "react";
import type { Item } from "../../items/items";
import { kindWord, search } from "../../library/search";
import type { AppData } from "../app-data";
import type { Nav, Screen } from "../App";
import { nameOf } from "./GameScreen";

let lastText = ""; // what was typed, kept when you come back

export function SearchScreen({ data, nav }: { data: AppData; nav: Nav }) {
  const [text, setText] = useState(lastText);
  const results = search(data.items, text);
  return (
    <section>
      <input
        className="filter search-box"
        type="search"
        autoFocus
        placeholder="Search names, keys, aliases, types"
        value={text}
        onChange={(e) => setText((lastText = e.target.value))}
      />
      {text.trim() !== "" && results.length === 0 && <p className="hint">Nothing found.</p>}
      <ul className="plain search-results">
        {results.map(({ item, detail }) => (
          <li key={item.key}>
            <button className={"link" + (item.status === "stub" ? " stub-link" : "")} onClick={() => nav.open(screenFor(item))}>
              {item.name}
            </button>
            <span className="sub">
              {" "}
              {kindWord(item)}
              {detail && ` · ${detail}`}
              {item.homePackage && ` · ${nameOf(item.homePackage, data.items)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function screenFor(item: Item): Screen {
  if (item.kind === "context") return { name: "pickup", key: item.key };
  if (item.kind === "roster") return { name: "roster", key: item.key };
  if (item.kind === "package") return { name: "package", key: item.key };
  if (item.kind === "game") return { name: "game", key: item.key };
  return { name: "item", key: item.key };
}
