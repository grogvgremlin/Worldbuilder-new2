// "Fold all · Open all" for a list of folding sections (owner, 26 Nov: "collapse all buttons where
// there are loads of sections so everything minimises at once"). The sections take `key={epoch}` and
// `open={openFor(default)}`, so pressing either redraws them all folded or all open.
import { useState } from "react";

export function useFoldAll() {
  const [epoch, setEpoch] = useState(0);
  const [all, setAll] = useState<boolean | null>(null);
  const press = (open: boolean) => (setAll(open), setEpoch((n) => n + 1));
  return {
    epoch,
    openFor: (fallback: boolean) => all ?? fallback,
    controls: (
      <span className="fold-all">
        <button className="link" onClick={() => press(false)}>Fold all</button> · <button className="link" onClick={() => press(true)}>Open all</button>
      </span>
    ),
  };
}
