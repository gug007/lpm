import type { ReactNode } from "react";
import { useAppStore, type SettingsTab, type View } from "../../store/app";
import { TAB_TITLES } from "../../settings-registry";
import { BranchNameInstructionsEditor } from "../BranchNameInstructionsEditor";
import { ClaudeStatusLineView } from "../ClaudeStatusLineView";
import { CodexStatusLineView } from "../CodexStatusLineView";
import { CommitInstructionsEditor } from "../CommitInstructionsEditor";
import { PRInstructionsEditor } from "../PRInstructionsEditor";
import { TemplateEditor } from "../TemplateEditor";
import type { MachineScope } from "./machineCommands";

interface PageProps {
  machine: MachineScope;
  onBack: () => void;
  backTitle: string;
}

interface Subpage {
  parent: SettingsTab;
  render: (props: PageProps, template: string | null) => ReactNode;
}

// Pages a Settings row opens, shown in place of that page with Settings' nav kept.
const SUBPAGES: Partial<Record<View, Subpage>> = {
  "claude-statusline": { parent: "agents", render: (p) => <ClaudeStatusLineView {...p} /> },
  "codex-statusline": { parent: "agents", render: (p) => <CodexStatusLineView {...p} /> },
  "commit-instructions": { parent: "git", render: (p) => <CommitInstructionsEditor {...p} /> },
  "pr-instructions": { parent: "git", render: (p) => <PRInstructionsEditor {...p} /> },
  "branch-instructions": { parent: "git", render: (p) => <BranchNameInstructionsEditor {...p} /> },
  template: {
    parent: "templates",
    render: (p, template) => template && <TemplateEditor key={template} name={template} {...p} />,
  },
};

export function settingsSubpageParent(view: View): SettingsTab | null {
  return SUBPAGES[view]?.parent ?? null;
}

export function SettingsSubpage({
  view,
  machine,
  template,
  onNavigate,
}: {
  view: View;
  machine: MachineScope;
  template: string | null;
  onNavigate: (view: View) => void;
}) {
  const page = SUBPAGES[view];
  if (!page) return null;
  const onBack = () => {
    useAppStore.getState().setSettingsTab(page.parent);
    onNavigate("settings");
  };
  return page.render({ machine, onBack, backTitle: TAB_TITLES[page.parent] }, template);
}
