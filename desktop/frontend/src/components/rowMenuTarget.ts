// What keeps its own right-click menu, or the system one: controls, fields,
// links, zones, and popovers that sit inside a row.
const KEEPS_ITS_MENU = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
  "[data-zone-frame]",
  "[data-row-menu='off']",
].join(", ");

// A click on selected text keeps the system menu: its Copy is what the user may
// be after. A selection elsewhere in the window doesn't decide the menu.
function isSelected(target: Element): boolean {
  const selection = target.ownerDocument.getSelection();
  return (
    selection !== null &&
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    selection.getRangeAt(0).intersectsNode(target)
  );
}

// Empty space is the row itself or plain content in it, like a title or a tip,
// unless the click is on selected text. The DOM check matters: React bubbles a
// right-click inside a portaled panel up to the row's handler.
export function isEmptyRowSpace(row: Element, target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const owner = target.closest(KEEPS_ITS_MENU);
  return (owner === null || !row.contains(owner)) && !isSelected(target);
}
