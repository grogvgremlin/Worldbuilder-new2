// An item's card over the page it was opened from (owner, 24 Nov: the rule card as a pop-up).
import type { AppData } from "../app-data";
import type { Nav } from "../App";
import { ItemScreen } from "./ItemScreen";

export function ItemPopup({ data, nav, itemKey, onClose }: { data: AppData; nav: Nav; itemKey: string; onClose: () => void }) {
  return (
    <div className="popup-back" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <button className="link popup-close" aria-label="Close" onClick={onClose}>✕</button>
        <ItemScreen data={data} nav={{ ...nav, open: (s) => (onClose(), nav.open(s)) }} itemKey={itemKey} />
      </div>
    </div>
  );
}
