// How far a finger may wander and still be a tap, and how soon and close a second tap must come to
// be a double tap. Owner, 26 Nov: "the double tap is very finicky, one in 3 or 4 tries": 6 px and
// 350 ms were tight for a thumb, so a wobbling tap became a small drag. Shared by the map and the
// Diagram so they behave the same.
export const TAP_SLOP_TOUCH = 14; // px
export const TAP_SLOP_MOUSE = 5; // px
export const DOUBLE_TAP_MS = 450;
export const DOUBLE_TAP_PX = 40;

export function tapSlop(pointerType: string): number {
  return pointerType === "mouse" ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH;
}

// After a double tap opens something (an item, the new-item pop-up), the phone still sends its own
// click a moment later, and it lands on whatever has just opened under the finger: a row on the
// item's page, or the pop-up's backdrop, closing it. This swallows that one click.
export function swallowNextClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 600);
}
