import type { RefObject } from "react";
import { TerminalComposer } from "../TerminalComposer";
import { ComposerReopenBar } from "../ComposerReopenBar";
import { useComposerStore } from "../../store/composer";
import { AskToType } from "./AskToType";
import type { SharedTabTerminalHandle } from "./SharedTabTerminal";

const noop = () => {};

// The prompt box under a shared tab: the one a local agent tab has, opened and
// closed with it, sending text only. While the host keeps the tab view only it
// stays in place, inert, so the terminal above doesn't move when typing is
// switched on, with a way to ask for it on top.
export function SharedTabComposer({
  slug,
  terminalId,
  label,
  hostName,
  canType,
  asked,
  askable,
  fontSize,
  terminal,
}: {
  slug: string;
  terminalId: string;
  label: string;
  hostName: string;
  canType: boolean;
  asked: boolean;
  askable: boolean;
  fontSize: number;
  terminal: RefObject<SharedTabTerminalHandle | null>;
}) {
  const open = useComposerStore((s) => s.open);
  if (!open) return <ComposerReopenBar targetLabel={label} fontSize={fontSize} />;
  return (
    <div className="relative">
      <div inert={!canType} className={canType ? undefined : "opacity-40"}>
        <TerminalComposer
          key={terminalId}
          terminalId={terminalId}
          historyKey={terminalId}
          projectName=""
          shown={canType}
          focused={canType}
          targetLabel={label}
          terminals={[]}
          cwd=""
          fontSize={fontSize}
          canFork={false}
          onFork={noop}
          canForkCopy={false}
          onForkCopy={noop}
          onSubmit={(input) => terminal.current?.submitInput(input) ?? false}
          onFocusTerminal={() => terminal.current?.focus()}
          agentAsks={() => terminal.current?.asks() ?? false}
          onRunInDuplicates={noop}
          onOpenMemorySession={noop}
          onDetachMemory={noop}
          guest
        />
      </div>
      {!canType && (
        <div className="absolute inset-0 flex items-center justify-center px-3">
          <AskToType slug={slug} hostName={hostName} asked={asked} askable={askable} />
        </div>
      )}
    </div>
  );
}
