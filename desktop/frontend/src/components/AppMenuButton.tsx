import { useState, type CSSProperties, type MouseEvent } from "react";
import { toast } from "sonner";
import { CheckForUpdate, QuitApp } from "../../bridge/commands";
import { EventsEmit } from "../../bridge/runtime";
import { isQuitChord, QUIT_LABEL, SETTINGS_CHORD } from "../appMenuKeys";
import { useEventListener } from "../hooks/useEventListener";
import { chordLabel, matchesChord } from "../keys";
import { AboutDialog } from "./AboutDialog";
import { MenuIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { Tooltip } from "./ui/Tooltip";

interface AppMenuButtonProps {
  onSettings: () => void;
  onFeedback: () => void;
}

function quit() {
  QuitApp().catch((err: unknown) => toast.error(String(err)));
}

async function checkForUpdates() {
  try {
    const info = await CheckForUpdate();
    if (info?.updateAvail) {
      EventsEmit("update-available", info);
      toast(`lpm ${info.latestVersion} is available`);
    } else {
      toast("lpm is up to date");
    }
  } catch (err) {
    toast.error(String(err));
  }
}

/** Linux/Windows stand-in for the macOS app menu: Settings, About, updates and
 *  Quit, plus their Ctrl+, and Ctrl+Shift+Q keys. Quit by key asks first, since
 *  it stops every terminal and agent; a second deliberate press confirms. */
export function AppMenuButton({ onSettings, onFeedback }: AppMenuButtonProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Capture phase: a focused terminal or composer would otherwise consume both.
  useEventListener(
    "keydown",
    (e) => {
      if (isQuitChord(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (confirmQuit) quit();
        else setConfirmQuit(true);
      } else if (matchesChord(e, SETTINGS_CHORD)) {
        e.preventDefault();
        e.stopPropagation();
        onSettings();
      }
    },
    window,
    true,
    true,
  );

  const openMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m ? null : { x: r.left, y: r.bottom + 4 }));
  };

  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <div className="mr-auto pl-3">
      {/* Not a native title: the webview would draw it over the open menu. */}
      <Tooltip content="lpm menu" side="right" delay={500} disabled={menu !== null} triggerClassName="flex">
        <button
          onClick={openMenu}
          // While open, keep this press from reaching the menu's outside-click
          // handler, so the click below closes the menu instead of reopening it.
          onMouseDown={(e) => {
            if (menu) e.stopPropagation();
          }}
          style={{ "--app-draggable": "no-drag" } as CSSProperties}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&_svg]:h-3.5 [&_svg]:w-3.5"
          aria-label="lpm menu"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
        >
          <MenuIcon />
        </button>
      </Tooltip>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} minWidth={200} onClose={() => setMenu(null)}>
          <ContextMenuItem label="Settings…" shortcut={chordLabel(SETTINGS_CHORD)} onClick={pick(onSettings)} />
          <ContextMenuItem label="Help Improve lpm…" onClick={pick(onFeedback)} />
          <ContextMenuItem label="Check for Updates…" onClick={pick(() => void checkForUpdates())} />
          <ContextMenuItem label="About lpm" onClick={pick(() => setAboutOpen(true))} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Quit lpm" shortcut={QUIT_LABEL} onClick={pick(quit)} />
        </ContextMenuShell>
      )}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ConfirmDialog
        open={confirmQuit}
        title="Quit lpm?"
        body={`Terminals and agents running in lpm will stop. Services keep running. Press ${QUIT_LABEL} again to quit.`}
        confirmLabel="Quit"
        onCancel={() => setConfirmQuit(false)}
        onConfirm={() => {
          setConfirmQuit(false);
          quit();
        }}
      />
    </div>
  );
}
