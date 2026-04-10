export type ConfigSection = {
  id: string;
  title: string;
};

export const CONFIG_SECTIONS: ConfigSection[] = [
  { id: "project", title: "Project" },
  { id: "services", title: "Services" },
  { id: "actions", title: "Actions" },
  { id: "terminals", title: "Terminals" },
  { id: "profiles", title: "Profiles" },
  { id: "global-config", title: "Global Config" },
  { id: "recipes", title: "Recipes" },
  { id: "path-resolution", title: "Path resolution" },
  { id: "validation", title: "Validation" },
];
