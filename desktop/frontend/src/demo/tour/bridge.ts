import { tapEvents } from "../ipc";
import * as cursor from "./cursor";
import { find, waitFor } from "./dom";
import { SOURCE, type AppMessage, type HostMessage } from "./protocol";
import { TourRunner } from "./runner";

type Unsourced<M> = M extends unknown ? Omit<M, "source"> : never;

// Output streams change no step's outcome, and fire many times a second.
const STREAMS = /^(pty-output-|log-update$|action-(bg-)?output$)/;

// The app focuses its composer and terminals as they open, and in a frame a
// focus scrolls the page around it too, so a step landed before the frame is in
// view would drag the visitor down to it. The tour's own clicks and typing
// already pass preventScroll; this makes it the rule for the app's as well.
function keepPageStill(): void {
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    focus.call(this, { ...options, preventScroll: true });
  };
}

// Takes tours from the page around the iframe and tells it how far they got.
export function connectTour(): void {
  if (window.parent === window) return;
  keepPageStill();
  const post = (message: Unsourced<AppMessage>) =>
    window.parent.postMessage({ source: SOURCE, ...message }, window.location.origin);
  let last = "";
  const runner = new TourRunner((stage, playing) => {
    const state = `${stage}:${playing}`;
    if (state === last) return;
    last = state;
    post({ type: "state", stage, playing });
  });

  window.addEventListener("message", (e) => {
    const message = e.data as HostMessage | null;
    if (e.source !== window.parent || message?.source !== SOURCE) return;
    if (message.type === "tour") runner.load(message.steps);
    else if (message.type === "play") runner.play();
    else if (message.type === "run") runner.runTo(message.index);
    else if (message.type === "settle") runner.settle();
    else if (message.type === "land") runner.settle(message.index);
  });

  const takeOver = (e: Event) => {
    if (e.isTrusted) runner.interrupt();
  };
  window.addEventListener("pointerdown", takeOver, true);
  window.addEventListener("keydown", takeOver, true);
  window.addEventListener("pointermove", (e) => e.isTrusted && cursor.hide(), true);

  let pending = false;
  tapEvents((event) => {
    if (pending || STREAMS.test(event)) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      runner.publish();
    }, 50);
  });

  void waitFor(() => find("button", "Add project"), 30_000).then(() => {
    last = "";
    post({ type: "ready" });
  });
}
