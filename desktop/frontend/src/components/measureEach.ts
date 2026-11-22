// Two at a time: a folder with node_modules can take seconds, and every walk
// competes for the same disk.
const PARALLEL = 2;

/** Measures each name, two at a time, handing over each result as it lands
 *  (null when it can't be measured). The returned function stops it. */
export function measureEach<T>(
  names: readonly string[],
  measure: (name: string) => Promise<T | null>,
  done: (name: string, value: T | null) => void,
): () => void {
  let cancelled = false;
  const queue = [...names];
  const worker = async () => {
    for (let name = queue.shift(); name !== undefined && !cancelled; name = queue.shift()) {
      const value = await measure(name).catch(() => null);
      if (!cancelled) done(name, value);
    }
  };
  void Promise.all(Array.from({ length: PARALLEL }, worker));
  return () => {
    cancelled = true;
  };
}
