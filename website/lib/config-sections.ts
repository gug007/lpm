export type ConfigSection = {
  id: string;
  title: string;
};

export const CONFIG_SECTIONS: ConfigSection[] = [
  { id: "project", title: "Project" },
  { id: "detection", title: "Service detection" },
  { id: "services", title: "Services" },
  { id: "actions", title: "Actions" },
  { id: "terminals", title: "Terminals" },
  { id: "profiles", title: "Profiles" },
  { id: "layers", title: "Config layers" },
  { id: "global-config", title: "Global config" },
  { id: "editor", title: "Editing in the app" },
  { id: "recipes", title: "Recipes" },
  { id: "path-resolution", title: "Path resolution" },
  { id: "validation", title: "Validation" },
];
