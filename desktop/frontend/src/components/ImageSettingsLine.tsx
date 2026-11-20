import { Cloud, KeyRound } from "lucide-react";
import { useImageDefaults } from "../hooks/useImageDefaults";
import { useAppStore } from "../store/app";
import { AnswerCardFoot } from "./AnswerCardFoot";

const openGenerateSettings = () => useAppStore.getState().openSettingsTab("generate");

// The foot of the image hover card: the model that will make it and what that
// costs, or that its key isn't saved yet, and Settings › Images & speech to
// change it.
export function ImageSettingsLine() {
  const defaults = useImageDefaults();
  const model = defaults?.model;
  const needsKey = defaults?.keyed === false;
  const Icon = needsKey ? KeyRound : Cloud;

  return (
    <AnswerCardFoot
      icon={
        <Icon
          aria-hidden
          size={13}
          className={`shrink-0 ${needsKey ? "text-[var(--accent-amber)]" : "text-[var(--accent-violet)]"}`}
        />
      }
      onSettings={openGenerateSettings}
    >
      {model ? (
        <>
          <span className="text-[var(--text-primary)]">{model.label}</span>
          {needsKey ? (
            <>
              {" · "}
              <span className="text-[var(--accent-amber-text)]">add a key</span>
            </>
          ) : (
            ` · ${model.provider} · ${model.cost}`
          )}
        </>
      ) : (
        "Images & speech"
      )}
    </AnswerCardFoot>
  );
}
