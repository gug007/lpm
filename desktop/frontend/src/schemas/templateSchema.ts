import repoSchema from "./repo-config.schema.json";

// Templates share the repo config's shape, but zones belong to the project,
// repo and global files: the app never reads them from a template and
// `lpm config` rejects them there.
const { zones: _zones, ...properties } = repoSchema.properties;

export const templateSchema = { ...repoSchema, properties };
