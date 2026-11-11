// Vitest setup: cancel() rejects an animation's `finished` promise. Browsers
// mark that rejection handled, as the Web Animations spec says; happy-dom 21
// doesn't, so cancelling in an effect's cleanup fails the run.
if (typeof window !== "undefined" && window.Animation) {
  const cancel = window.Animation.prototype.cancel;
  window.Animation.prototype.cancel = function (this: Animation) {
    this.finished.catch(() => {});
    cancel.call(this);
  };
}

export {};
