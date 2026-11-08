import { deferred } from "./deferred";

export type { EditorTarget } from "./MonacoEditorImpl";

// Monaco is about half the bundle and the first screen doesn't show it.
export const MonacoEditor = deferred(() => import("./MonacoEditorImpl").then((m) => m.MonacoEditor));
