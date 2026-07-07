import type { ITheme } from "@xterm/xterm";
import { InteractivePane, type InteractivePaneHandle } from "./InteractivePane";
import { TerminalHandoffPlaceholder } from "./TerminalHandoffPlaceholder";
import { useIsControlled, useControlOwner } from "../store/terminalControl";

// One interactive terminal tab. A terminal is live-rendered and controllable in
// exactly one surface at a time; when another window/phone owns it this shows a
// "take control" placeholder instead. The InteractivePane stays MOUNTED but
// display:none behind the placeholder so this window keeps draining the PTY and
// serving mirror snapshots (it's still the PTY owner / a presenter) without
// grabbing focus, driving the shared size, or showing a mis-fitted copy.
export function InteractiveTab({
  terminalId,
  visible,
  fontSize,
  themeOverride,
  cwd,
  paneRef,
}: {
  terminalId: string;
  visible: boolean;
  fontSize: number;
  themeOverride: ITheme | null;
  cwd: string;
  paneRef: (el: InteractivePaneHandle | null) => void;
}) {
  const controlled = useIsControlled(terminalId);
  const owner = useControlOwner(terminalId);
  return (
    <>
      {!controlled && (
        <TerminalHandoffPlaceholder
          terminalId={terminalId}
          ownerLabel={owner?.label ?? "another window"}
        />
      )}
      <div className={controlled ? "contents" : "hidden"}>
        <InteractivePane
          ref={paneRef}
          terminalId={terminalId}
          visible={visible}
          fontSize={fontSize}
          themeOverride={themeOverride}
          cwd={cwd}
        />
      </div>
    </>
  );
}
