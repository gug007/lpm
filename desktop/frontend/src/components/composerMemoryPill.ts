// The composer's memory pill is two adjacent spans, the command and then the
// session id (see highlightCommand). For hovering they are one target: the
// first span stands for the pill, and its box covers both.

function isPillPart(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.memchip !== undefined;
}

export function memoryPillAt(target: Element): HTMLElement | null {
  const part = target.closest<HTMLElement>("[data-memchip]");
  if (!part) return null;
  return isPillPart(part.previousSibling) ? part.previousSibling : part;
}

export function memoryPillRect(pill: HTMLElement): DOMRect {
  const head = pill.getBoundingClientRect();
  if (!isPillPart(pill.nextSibling)) return head;
  const tail = pill.nextSibling.getBoundingClientRect();
  const left = Math.min(head.left, tail.left);
  const top = Math.min(head.top, tail.top);
  return new DOMRect(
    left,
    top,
    Math.max(head.right, tail.right) - left,
    Math.max(head.bottom, tail.bottom) - top,
  );
}
