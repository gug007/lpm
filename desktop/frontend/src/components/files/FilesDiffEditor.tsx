import { deferred } from "../deferred";

export const FilesDiffEditor = deferred(() => import("./FilesDiffEditorImpl").then((m) => m.FilesDiffEditor));
