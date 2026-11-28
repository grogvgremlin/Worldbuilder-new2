// How a selected box is marked on the Diagram (owner, 28 Nov: "selected being bordered or not, the
// border colour & style, highlighted etc. should be part of the container card under Diagram
// settings"): the shown tree's or network's settings, else the app's own. As CSS variables on the
// diagram, read by .diagram-node.selected.
import type { CSSProperties } from "react";
import type { LinkKind } from "../../../items/items";

export const SELECTED_COLOUR = "#1f5c8f";

export function selectedLook(kind: LinkKind | undefined): CSSProperties {
  const colour = kind?.selectedColour ?? SELECTED_COLOUR;
  const dash = kind?.selectedLine === "dashed" ? "8 4" : kind?.selectedLine === "dotted" ? "2 4" : "none";
  const fill = kind?.selectedFill === false ? "var(--ground)" : tint(colour);
  return { ["--sel-colour" as string]: colour, ["--sel-dash" as string]: dash, ["--sel-fill" as string]: fill };
}

// A colour at a fifth of its strength, for the fill.
function tint(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "var(--panel)";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return `rgba(${r}, ${g}, ${b}, 0.18)`;
}
