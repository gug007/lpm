import { deferred } from "../deferred";

export const MonacoDiffPool = deferred(() => import("./MonacoDiffPoolImpl").then((m) => m.MonacoDiffPool));
