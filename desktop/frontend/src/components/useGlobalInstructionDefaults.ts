import { useEffect, useState } from "react";
import {
  ReadBranchNameInstructions,
  ReadCommitInstructions,
  ReadPRDescriptionInstructions,
  ReadPRTitleInstructions,
} from "../../bridge/commands";
import {
  DEFAULT_BRANCH_NAME_INSTRUCTIONS,
  DEFAULT_COMMIT_INSTRUCTIONS,
  DEFAULT_PR_DESCRIPTION_INSTRUCTIONS,
  DEFAULT_PR_TITLE_INSTRUCTIONS,
  withDefault,
} from "../aiInstructions";

// This Mac's global instructions for each project key, as the global editors
// show them: the saved text, or the built-in default when none is saved.
const GLOBAL_READERS: Record<string, () => Promise<string>> = {
  commit: withDefault(() => ReadCommitInstructions(), DEFAULT_COMMIT_INSTRUCTIONS),
  "pr-title": withDefault(() => ReadPRTitleInstructions(), DEFAULT_PR_TITLE_INSTRUCTIONS),
  "pr-description": withDefault(() => ReadPRDescriptionInstructions(), DEFAULT_PR_DESCRIPTION_INSTRUCTIONS),
  "branch-name": withDefault(() => ReadBranchNameInstructions(), DEFAULT_BRANCH_NAME_INSTRUCTIONS),
};

export function useGlobalInstructionDefaults(
  sections: { id: string; keys: string[] }[],
  enabled: boolean,
): Record<string, string> {
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all(
      sections.map(async ({ id, keys }) => {
        try {
          const read = await Promise.all(keys.map((key) => GLOBAL_READERS[key]?.() ?? Promise.resolve("")));
          return [id, read.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean).join("\n")] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setTexts(Object.fromEntries(entries.filter((e) => e !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [sections, enabled]);

  return texts;
}
