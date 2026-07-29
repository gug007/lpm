import type { IDisposable, Terminal } from "@xterm/xterm";

// xterm resolves links only while the pointer crosses into a different cell,
// and a click activates whatever that last hover left behind. In a terminal
// that keeps printing — an agent streaming output, a TUI redrawing — the text
// under a resting pointer changes without any pointer movement, so the link
// that just appeared under the cursor is invisible to the click and nothing
// opens until the mouse is jiggled. Nudging the hover onto a neighbouring row
// and straight back before every mousedown forces a fresh lookup, so a click
// always activates the link that is actually under it.
//
// The synthetic moves don't bubble: xterm forwards mouse reports to the
// running program from listeners on the terminal element, one level above the
// screen element the linkifier listens on, so the program never sees them.
export function installLinkHoverRefresh(term: Terminal, host: HTMLElement): IDisposable {
  const refresh = (e: MouseEvent) => {
    if (e.button !== 0 || term.rows < 2) return;
    const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
    if (!screen) return;
    const rect = screen.getBoundingClientRect();
    const cellHeight = rect.height / term.rows;
    if (!Number.isFinite(cellHeight) || cellHeight <= 0) return;

    const row = Math.ceil((e.clientY - rect.top) / cellHeight);
    const neighbour = row > 1 ? e.clientY - cellHeight : e.clientY + cellHeight;
    for (const clientY of [neighbour, e.clientY]) {
      screen.dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: e.clientX,
          clientY,
          bubbles: false,
          cancelable: true,
          view: window,
        }),
      );
    }
  };

  host.addEventListener("mousedown", refresh, true);
  return { dispose: () => host.removeEventListener("mousedown", refresh, true) };
}
