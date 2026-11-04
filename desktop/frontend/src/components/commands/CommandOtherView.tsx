import { Check, ExternalLink, Lock } from "lucide-react";
import type { CommandScope, LpmCommandLists, OtherSkill } from "../../lpmCommands";
import { CommandPlaceSelect } from "./CommandPlaceSelect";
import { agentReach, commandPath, scopeTitle, type OtherSpot } from "./commandsModel";
import type { SkillFiles } from "./skillFile";
import { SkillPathButton } from "./SkillPathButton";

interface CommandOtherViewProps {
  skill: OtherSkill;
  scope: CommandScope;
  lists: LpmCommandLists;
  projectLabel: string;
  files: SkillFiles;
  onMove: (spot: OtherSpot) => void;
  onConvert: () => void;
  onOpenInAgentSetup: () => void;
}

const LABEL = "text-[11.5px] font-medium text-[var(--text-muted)]";

// The right column for a skill not made in lpm: what it is and which agents can
// use it. It can't be changed here; Agent setup is where that happens.
export function CommandOtherView({
  skill,
  scope,
  lists,
  projectLabel,
  files,
  onMove,
  onConvert,
  onOpenInAgentSetup,
}: CommandOtherViewProps) {
  const saved = { ...skill, scope };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate font-mono text-[15px] font-medium text-[var(--text-primary)]">/{skill.name}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
            <Lock size={10} />
            Read-only
          </span>
          <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">{scopeTitle(scope, projectLabel)}</span>
        </div>
        {skill.description && (
          <p className="max-w-[62ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">{skill.description}</p>
        )}
        <div className="flex max-w-[280px] flex-col gap-1.5">
          <span id="lpm-other-folder-label" className={LABEL}>
            Folder
          </span>
          <CommandPlaceSelect
            id="lpm-other-folder"
            labelledBy="lpm-other-folder-label"
            place={{ scope, folder: skill.folder ?? null }}
            lists={lists}
            projectLabel={projectLabel}
            onlyScope={scope}
            otherGroup={{
              current: !skill.folder && !skill.atRoot,
              onChoose: () => onMove({ folder: null, root: false }),
            }}
            onChange={(place) => onMove({ folder: place.folder, root: place.folder === null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Works in</span>
          <ul className="flex flex-wrap gap-1.5">
            {agentReach(skill.agents).map((agent) =>
              agent.reads ? (
                <li
                  key={agent.label}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[12px] text-[var(--text-primary)]"
                >
                  <Check size={12} className="text-[var(--accent-green)]" />
                  {agent.label}
                </li>
              ) : (
                <li
                  key={agent.label}
                  className="rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[12px] text-[var(--text-muted)]"
                >
                  {agent.label}
                  <span className="sr-only"> can't use it</span>
                </li>
              ),
            )}
          </ul>
        </div>
        {skill.preview && (
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className={LABEL}>Instructions</span>
            <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {skill.preview}
            </pre>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
        <SkillPathButton label={commandPath(saved, saved)} path={skill.path} scope={scope} files={files} />
        <button
          type="button"
          onClick={onConvert}
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          Convert to lpm skill
        </button>
        <button
          type="button"
          onClick={onOpenInAgentSetup}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <ExternalLink size={12} />
          Open in Agent setup
        </button>
      </div>
    </div>
  );
}
