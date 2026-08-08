// Whether someone is actually at the app, and when they next touch it.
//
// "The window is on screen" is not the same as "a person is looking at it": an
// agent routinely finishes while the app sits behind an editor or the Mac is
// unattended. Anything that dismisses a notice on the user's behalf has to wait
// for proof of presence, and the only honest proof is a deliberate input.

type Listener = () => void;

// Movement and hover don't count — a nudged trackpad shouldn't retire a badge.
// These three cover typing (terminal, composer, dialogs), clicking anywhere in
// the chrome, and scrolling terminal output.
const INTERACTION_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

const listeners = new Set<Listener>();
let wired = false;

/** The window has key focus and isn't hidden or minimized. */
export function isAttended(): boolean {
  return document.hasFocus() && !document.hidden;
}

function fire() {
  if (!isAttended()) return;
  for (const listener of [...listeners]) listener();
}

// Capture at the window so xterm's own handlers — which preventDefault and can
// stop propagation on the way back up — can't swallow a keystroke before it
// counts as interaction.
function wire() {
  if (wired) return;
  wired = true;
  for (const event of INTERACTION_EVENTS)
    window.addEventListener(event, fire, { capture: true, passive: true });
}

/** Calls back on the next deliberate input while the window is focused. */
export function onUserInteraction(listener: Listener): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
