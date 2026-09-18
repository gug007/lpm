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
import { ComposerToolbarSlot } from "./ComposerToolbarSlot";
import { SquarePenIcon } from "./icons";
import { SendSplitButton, type SendSplitButtonProps } from "./SendSplitButton";
import { TerminalHistoryButton, type TerminalHistoryButtonProps } from "./TerminalHistoryButton";

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
  history: ComposerHistorySource;
  onNewInput: () => void;
  // Null when the tool has nothing to offer this terminal: it then shows in
  // neither place, without touching where the user keeps it.
  actions: ComposerActionsButtonProps | null;
  memory: ComposerMemoryButtonProps | null;
  model: ComposerModelButtonProps | null;
  fork: ComposerForkProps;
  send: SendSplitButtonProps;
}

// The button row under the terminal input. Every tool but Send lives either
// here, as a button, or in the More menu at the row's end, and the user moves
// it between the two from either place.
export function ComposerToolbar({ boxRef, history, onNewInput, actions, memory, model, fork, send }: ComposerToolbarProps) {
  const layout = useComposerToolbar({
    actions: actions !== null,
    memory: memory !== null,
    model: model !== null,
    fork: fork.canFork,
    forkCopy: fork.canForkCopy,
  });

  const renderTool = (id: ComposerToolId, variant: ComposerToolVariant, host?: ComposerMenuHost) => {
    switch (id) {
      case "mic":
        return <ComposerMicButton variant={variant} onPick={host?.close} />;
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
          <TerminalHistoryButton {...history} boxRef={boxRef} variant={variant} onOpenChange={host?.onOpenChange} />
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
    }
  };

  // Model keeps its seat at the right edge beside Send; every other button
  // sits on the left, in canonical order, with the More menu after them.
  const left = layout.toolbar.filter((id) => id !== "model");
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
    <div className="flex items-center justify-between px-2 pb-1">
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
      <div className="flex items-center gap-1.5">
        {layout.toolbar.includes("model") && slot("model")}
        <SendSplitButton {...send} />
      </div>
    </div>
  );
}
