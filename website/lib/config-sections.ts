export type ConfigSection = {
  id: string;
  title: string;
};

export type ConfigSectionGroup = {
  title: string;
  sections: ConfigSection[];
};

export const CONFIG_SECTION_GROUPS: ConfigSectionGroup[] = [
  {
    title: "Set up",
    sections: [
      { id: "with-ai", title: "Ask your agent" },
      { id: "editor", title: "Editing in the app" },
    ],
  },
  {
    title: "Reference",
    sections: [
      { id: "project", title: "Project" },
      { id: "detection", title: "Service detection" },
      { id: "services", title: "Services" },
      { id: "actions", title: "Actions" },
      { id: "terminals", title: "Terminals" },
      { id: "zones", title: "Zones" },
      { id: "profiles", title: "Profiles" },
    ],
  },
  {
    title: "Sharing",
    sections: [
      { id: "layers", title: "Config layers" },
      { id: "global-config", title: "Global config" },
      { id: "templates", title: "Templates" },
    ],
  },
  {
    title: "More",
    sections: [
      { id: "recipes", title: "Recipes" },
      { id: "path-resolution", title: "Path resolution" },
      { id: "validation", title: "Validation" },
    ],
  },
];

export const CONFIG_SECTIONS: ConfigSection[] = CONFIG_SECTION_GROUPS.flatMap(
  (group) => group.sections,
);
