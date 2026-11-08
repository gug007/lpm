export const PROJECT_SCHEMA_URI = "lpm://schemas/project-config.json";
export const GLOBAL_SCHEMA_URI = "lpm://schemas/global-config.json";
export const REPO_SCHEMA_URI = "lpm://schemas/repo-config.json";
export const TEMPLATE_SCHEMA_URI = "lpm://schemas/template-config.json";
export const ACTION_SCHEMA_URI = "lpm://schemas/action.json";
export const PROJECT_MODEL_URI = "inmemory://lpm/project.yml";
export const GLOBAL_MODEL_URI = "inmemory://lpm/global.yml";
export const REPO_MODEL_URI = "inmemory://lpm/repo.yml";
export const TEMPLATE_MODEL_URI = "inmemory://lpm/template.yml";
// The action wizard editor validates a single action mapping, not a whole
// config. A fixed model URI (exact fileMatch, like the entries above) keeps
// matching deterministic; the wizard forces a fresh editor via its React key.
export const ACTION_MODEL_URI = "inmemory://lpm/action.yml";
