// Models shim — runtime side. There are no model classes; call sites only use
// them as `main.<Type>.createFrom(data)` / `notes.<Type>.createFrom(data)` to
// shape a plain object before it is JSON-serialized to the backend. A Proxy
// returns an identity `createFrom` for every type, which is all they need.
const passthrough = { createFrom: (data) => data };
const handler = { get: () => passthrough };

export const main = new Proxy({}, handler);
export const notes = new Proxy({}, handler);
