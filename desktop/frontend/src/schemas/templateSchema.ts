import repoSchema from "./repo-config.schema.json";

// Templates share the repo config's shapes, but the app reads only actions
// and terminals from a template (not its zones, services, profiles or
// extends), and `lpm config` rejects the rest there.
const { actions, terminals } = repoSchema.properties;

export const templateSchema = { ...repoSchema, properties: { actions, terminals } };
