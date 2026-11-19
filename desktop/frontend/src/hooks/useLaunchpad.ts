import { useEffect, useMemo, useState } from "react";
import { toast } from "../notifications/toast";
import { composerValueToText } from "../composerValue";
import { EMPTY_COMPOSER, type ComposerValue } from "../components/InputComposer";
import { inGroupColor, noteChildRun } from "../components/splitPrimary";
import { launchpadTabs, loadLaunchpadAction, saveLaunchpadAction } from "../launchpadAgentActions";
import { launchpadCommand } from "../launchpadCommand";
import { loadNewTabMemory, saveNewTabMemory, type NewTabMemory, type NewTabPick } from "../newTabPick";
import { peerSlugOf } from "../peer/markers";
import type { RemoteAgentLaunch } from "../remoteAgentTabs";
import { AI_CLI_OPTIONS, type ActionInfo } from "../types";
import type { RunActionOpts } from "./useProjectActions";
import { MACHINE } from "../machineWords";
import { takeLaunchpadSeed, useLaunchpadSeed } from "../store/launchpadSeed";

// The project a launchpad starts things in, and its actions to offer.
export interface LaunchpadProject {
  name: string;
  // What the user calls it, for the prompt history.
  label: string;
  root: string;
  actions: ActionInfo[];
}

export interface LaunchpadTargets {
  onNewTerminal: () => void;
  // What was typed, run in a new terminal.
  onRunCommand: (command: string) => void;
  onOpenAgent: (launch: RemoteAgentLaunch) => void;
  onRunAction: (action: ActionInfo, opts?: RunActionOpts) => void;
}

// What the empty project's launchpad and the + popup both start: a terminal
// that runs what was typed, or an agent that takes it as its first prompt.
// Terminal until something is started; then whatever was last.
export function useLaunchpad(project: LaunchpadProject, targets: LaunchpadTargets) {
  const [memory, setMemory] = useState<NewTabMemory>(loadNewTabMemory);
  const [picked, setPicked] = useState(loadLaunchpadAction);
  const [value, setValue] = useState<ComposerValue>(EMPTY_COMPOSER);

  const tabs = useMemo(() => launchpadTabs(project.actions, project.name), [project.actions, project.name]);
  const options = useMemo(() => tabs.flatMap((t) => t.options), [tabs]);
  // A prompt a link left for this project: its agent picked, its text in the
  // box, and nothing started until Return.
  const [seeded, setSeeded] = useState<{ key: number; value: ComposerValue } | null>(null);
  const seed = useLaunchpadSeed((s) => (s.seed?.projectName === project.name ? s.seed : null));
  useEffect(() => {
    if (!seed || !takeLaunchpadSeed(project.name)) return;
    const wanted = options.find((o) => o.agent === seed.agent);
    const target = wanted ?? options[0];
    if (target) setPicked(target.id);
    if (seed.agent && !wanted && target) {
      const asked = AI_CLI_OPTIONS.find((o) => o.value === seed.agent)?.label ?? seed.agent;
      toast(`${project.label}'s new tab has no ${asked}, so the prompt is set for ${target.label}.`);
    }
    const next = { ...EMPTY_COMPOSER, text: seed.text };
    setValue(next);
    setSeeded({ key: seed.nonce, value: next });
  }, [seed, options, project.name, project.label]);
  const option = useMemo(() => options.find((o) => o.id === picked) ?? null, [options, picked]);
  const pick = option && !option.action ? memory[option.agent] : null;
  const text = composerValueToText(value);
  const command = option ? launchpadCommand(text) : text;

  const changePick = (next: NewTabPick) => {
    const updated = { ...memory, [next.agent]: next };
    setMemory(updated);
    saveNewTabMemory(updated);
  };

  // False when it can't start yet.
  const start = (): boolean => {
    if (value.pending) return false;
    // Attachments are saved on this Mac, where a paired Mac's agent can't
    // read them; its own tab's composer uploads them instead.
    if (value.images.length > 0 && peerSlugOf(project.name)) {
      toast.error(
        `Images can't go to a connected ${MACHINE.noun} from here. Start the agent, then attach them in its tab.`,
      );
      return false;
    }
    saveLaunchpadAction(option?.id ?? "terminal");
    if (!option || command !== null) {
      if (command) targets.onRunCommand(command);
      else targets.onNewTerminal();
      return true;
    }
    const prompt = text || undefined;
    const { action, group } = option;
    if (!action) {
      targets.onOpenAgent({ ...memory[option.agent], prompt });
    } else if (group) {
      noteChildRun(project.name, group, action);
      targets.onRunAction(inGroupColor(group, action), { prompt });
    } else {
      targets.onRunAction(action, { prompt });
    }
    return true;
  };

  return { tabs, option, command, pick, value, setValue, select: setPicked, changePick, start, seeded };
}

export type Launchpad = ReturnType<typeof useLaunchpad>;
