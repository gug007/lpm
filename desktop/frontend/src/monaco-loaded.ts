import type * as monacoNs from "monaco-editor";

let loaded: typeof monacoNs | null = null;

// For code that only cares about editors already on screen: if Monaco hasn't
// loaded yet there are none, and asking must not be what loads it.
export function loadedMonaco(): typeof monacoNs | null {
  return loaded;
}

export function markMonacoLoaded(monaco: typeof monacoNs): void {
  loaded = monaco;
}
