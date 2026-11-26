// The colours areas and outlines are drawn in, in one place, so a list's dot is the colour of what it
// stands for (owner, 26 Nov: "the dots on both maps and here should be the same colour as the
// container"). The map's styles.css uses the same values for its classes.
import type { Thing } from "../../../items/items";

export const DEPTH_COLOURS = ["#8a6d3b", "#2f6f8f", "#6b8f2f", "#8f2f5e"]; // a tree's areas, by depth
export const GROUP_COLOUR = "#b07a1f"; // groups: dashed
export const TREE_COLOURS = ["#2f6f8f", "#6b8f2f", "#8f2f5e"]; // other trees: dotted, one colour each

// A container drawn as an area or outline: its own colour if set, else by what it is.
export function colourOf(thing: Thing, by: "group" | "tree", treeIndex: number, depth: number): string {
  if (thing.colour) return thing.colour;
  if (by === "group") return GROUP_COLOUR;
  return treeIndex > 0 ? TREE_COLOURS[treeIndex % 3] : DEPTH_COLOURS[depth % 4];
}
