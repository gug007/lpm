export type ConfigLayer = {
  name: string;
  tab: string;
  path: string;
  holds: string;
  scope: string;
};

export const CONFIG_LAYERS: ConfigLayer[] = [
  {
    name: "Your project file",
    tab: "User",
    path: "~/.lpm/projects/<name>.yml",
    holds: "Everything: root or ssh, services, actions, terminals, profiles",
    scope: "Personal — stays outside the repo",
  },
  {
    name: "Repo config",
    tab: "Repo",
    path: "<project root>/.lpm.yml",
    holds: "Services, actions, terminals, profiles",
    scope: "Shared — commit it with the code",
  },
  {
    name: "Global config",
    tab: "Global",
    path: "~/.lpm/global.yml",
    holds: "Actions and terminals",
    scope: "Every project on this Mac",
  },
];
