// v2-shaped models shim — runtime side.
// Re-exports v3 model classes under the `main` and `notes` namespaces so call
// sites like `main.TerminalsConfig.createFrom(...)` keep working at runtime.
export * as main from "../../bindings/github.com/gug007/lpm/desktop/models.js";
export * as notes from "../../bindings/github.com/gug007/lpm/desktop/notes/models.js";
