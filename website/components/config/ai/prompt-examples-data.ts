export type PromptExample = {
  prompt: string;
  lands: string;
};

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    prompt: "Add Storybook as a service on port 6006",
    lands: "Just you, this project",
  },
  {
    prompt:
      "Make Deploy a split button: staging by default, production asks first",
    lands: "Just you, this project",
  },
  {
    prompt: "Put the iOS and Android builds in a two-row zone in the footer",
    lands: "Just you, this project",
  },
  {
    prompt: "Share our test, lint and migrate buttons with the team",
    lands: "The team, in the repo’s .lpm.yml",
  },
  {
    prompt:
      "Give every project a Claude Code button that reviews my uncommitted changes",
    lands: "Every project, in global.yml",
  },
  {
    prompt: "This project won’t load. Find what’s wrong in its config and fix it",
    lands: "Whichever file is broken",
  },
];
