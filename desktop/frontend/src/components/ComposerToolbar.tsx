import type { RefObject } from "react";
import { useComposerToolbar } from "../hooks/useComposerToolbar";
import type { ComposerToolId, ComposerToolVariant } from "../composerTools";
import { COLLECTION_DRAFTS } from "../store/messageHistory";
import { ComposerActionsButton, type ComposerActionsButtonProps } from "./ComposerActionsButton";
import { ComposerForkButton } from "./ComposerForkButton";
import { ComposerMemoryButton, type ComposerMemoryButtonProps } from "./ComposerMemoryButton";
import { ComposerMicButton } from "./ComposerMicButton";
import { ComposerModelButton, type ComposerModelButtonProps } from "./ComposerModelButton";
import { ComposerMoreButton, type ComposerMenuHost } from "./ComposerMoreButton";
import { ComposerNewInputButton } from "./ComposerNewInputButton";
import { ComposerSaveCommandButton } from "./ComposerSaveCommandButton";
import { ComposerToolbarSlot } from "./ComposerToolbarSlot";
import { SquarePenIcon } from "./icons";
import { SendSplitButton, type SendSplitButtonProps } from "./SendSplitButton";
import { TerminalHistoryButton, type TerminalHistoryButtonProps } from "./TerminalHistoryButton";
import { TerminalHistoryPanel } from "./TerminalHistoryPanel";
import { DICTATION_AVAILABLE } from "../hooks/useVoiceDictation";
import { useDictationHost } from "../hooks/useDictationHost";
import { DictationStrip } from "./dictation/DictationStrip";

export type ComposerHistorySource = Pick<
  TerminalHistoryButtonProps,
  "terminalId" | "projectName" | "terminalLabel" | "onPick" | "onSend"
>;

export interface ComposerForkProps {
  canFork: boolean;
  onFork: () => void;
  canForkCopy: boolean;
  onForkCopy: () => void;
}

interface ComposerToolbarProps {
  // The composer box, which the history popovers span whatever they hang from.
  boxRef: RefObject<HTMLDivElement | null>;
  // The composer's editor: where its mic dictates, whatever has focus.
  editorRef: RefObject<HTMLElement | null>;
  history: ComposerHistorySource;
  onNewInput: () => void;
  // Null when the tool has nothing to offer this terminal: it then shows in
  // neither place, without touching where the user keeps it.
  actions: ComposerActionsButtonProps | null;
  memory: ComposerMemoryButtonProps | null;
  model: ComposerModelButtonProps | null;
  fork: ComposerForkProps;
  // Saving the prompt as an lpm command; null where the terminal runs no agent.
  saveCommand: { disabled: boolean; onSave: () => void } | null;
  send: SendSplitButtonProps;
  // History › Drafts asked for from outside the row (a toast's Open Drafts),
  // wherever the Drafts tool sits.
  draftsOpen: boolean;
  onDraftsClose: () => void;
}

// The button row under the terminal input. Every tool but Send lives either
// here, as a button, or in the More menu at the row's end, and the user moves
// it between the two from either place.
export function ComposerToolbar({
  boxRef,
  editorRef,
  history,
  onNewInput,
  actions,
  memory,
  model,
  fork,
  saveCommand,
  send,
  draftsOpen,
  onDraftsClose,
}: ComposerToolbarProps) {
  // Dictating into this composer: the recorder takes over the row — the
  // strip where the tools were, the mic as the one button beside them. A
  // failed take's notice keeps the strip but gives Send back.
  const dictationPhase = useDictationHost(boxRef);
  const dictating = dictationPhase !== null;
  const recording = dictating && dictationPhase !== "error";
  const layout = useComposerToolbar({
    mic: DICTATION_AVAILABLE,
    actions: actions !== null,
    memory: memory !== null,
    model: model !== null,
    fork: fork.canFork,
    forkCopy: fork.canForkCopy,
    saveCommand: saveCommand !== null,
  });

  const renderTool = (id: ComposerToolId, variant: ComposerToolVariant, host?: ComposerMenuHost) => {
    switch (id) {
      case "mic":
        return (
          <ComposerMicButton
            into={editorRef}
            variant={variant}
            onPick={host?.close}
            prominent={variant === "button" && (send.disabled || recording)}
          />
        );
      case "actions":
        return (
          actions && (
            <ComposerActionsButton {...actions} align="left" variant={variant} onOpenChange={host?.onOpenChange} />
          )
        );
      case "newInput":
        return (
          <ComposerNewInputButton
            variant={variant}
            onClick={() => {
              host?.close();
              onNewInput();
            }}
          />
        );
      case "drafts":
        return (
          <TerminalHistoryButton
            {...history}
            boxRef={boxRef}
            scheduled
            initialCollection={COLLECTION_DRAFTS}
            icon={<SquarePenIcon />}
            tooltip="Drafts"
            ariaLabel="Drafts"
            variant={variant}
            onOpenChange={host?.onOpenChange}
          />
        );
      case "history":
        return (
          <TerminalHistoryButton
            {...history}
            boxRef={boxRef}
            scheduled
            variant={variant}
            onOpenChange={host?.onOpenChange}
          />
        );
      case "memory":
        return memory && <ComposerMemoryButton {...memory} variant={variant} onOpenChange={host?.onOpenChange} />;
      case "model":
        return model && <ComposerModelButton {...model} variant={variant} onOpenChange={host?.onOpenChange} />;
      case "fork":
        return (
          <ComposerForkButton
            kind="fork"
            variant={variant}
            onClick={() => {
              host?.close();
              fork.onFork();
            }}
          />
        );
      case "forkCopy":
        return (
          <ComposerForkButton
            kind="forkCopy"
            variant={variant}
            onClick={() => {
              host?.close();
              fork.onForkCopy();
            }}
          />
        );
      case "saveCommand":
        return (
          saveCommand && (
            <ComposerSaveCommandButton
              variant={variant}
              disabled={saveCommand.disabled}
              onClick={() => {
                host?.close();
                saveCommand.onSave();
              }}
            />
          )
        );
    }
  };

  // Model and the mic keep their seats at the right edge beside Send; every
  // other button sits on the left, in canonical order, with the More menu
  // after them. With nothing to send, the mic takes Send's place.
  const left = layout.toolbar.filter((id) => id !== "model" && id !== "mic");
  const micBesideSend = layout.toolbar.includes("mic");
  const slot = (id: ComposerToolId) => (
    <ComposerToolbarSlot
      key={id}
      id={id}
      isDefault={layout.isDefault}
      onMove={() => layout.move(id, false)}
      onReset={layout.reset}
    >
      {renderTool(id, "button")}
    </ComposerToolbarSlot>
  );

  return (
    <div data-dictation-host className="flex items-center justify-between gap-2 px-2 pb-1">
      {dictating ? (
        <div className="dictation-tone-composer flex min-w-0 flex-1">
          <DictationStrip />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {left.map(slot)}
          {layout.menu.length > 0 && (
            <ComposerMoreButton
              tools={layout.menu}
              isDefault={layout.isDefault}
              renderRow={(id, host) => renderTool(id, "row", host)}
              onMove={(id) => layout.move(id, true)}
              onReset={layout.reset}
            />
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        {layout.toolbar.includes("model") && slot("model")}
        {micBesideSend ? slot("mic") : recording && <ComposerMicButton into={editorRef} prominent />}
        {!(micBesideSend && send.disabled) && !recording && <SendSplitButton {...send} />}
      </div>
      <TerminalHistoryPanel
        {...history}
        open={draftsOpen}
        onClose={onDraftsClose}
        boxRef={boxRef}
        scheduled
        initialCollection={COLLECTION_DRAFTS}
      />
    </div>
  );
}
