// A drag previews its moves into the store and a drop saves them a moment
// later. A project list read in either window would put the buttons back where
// they still are on disk, so while anything holds, refreshes wait and then run
// once.
let holds = 0;
let waiting: { promise: Promise<void>; resolve: () => void } | null = null;

export function refreshHeld(): boolean {
  return holds > 0;
}

// Resolves once the refresh that was put off has run.
export function deferRefresh(): Promise<void> {
  if (!waiting) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    waiting = { promise, resolve };
  }
  return waiting.promise;
}

// Returns the release; calling it more than once is harmless.
export function holdRefresh(refresh: () => Promise<void>): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds > 0 || !waiting) return;
    const { resolve } = waiting;
    waiting = null;
    void refresh().then(resolve, resolve);
  };
}
