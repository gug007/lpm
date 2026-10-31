const CODE = "font-mono";

// What lpm adds to a computer, and how to take all of it back out.
export function RemoveLpm() {
  return (
    <>
      <p>
        Choose Remove app in lpm&apos;s settings: it stops your projects and
        removes the <code className={CODE}>lpm</code>{" "}command, its agent
        skills, its Claude Code and Codex hooks and its Claude Code status
        line. On macOS it also moves the app to the Trash and can erase
        settings, project config and notes. On Windows, finish in Settings →
        Apps → Installed apps; on Linux, remove the package or delete the
        AppImage. Both keep your settings in{" "}
        <code className={CODE}>~/.lpm</code>.
      </p>
      <p className="mt-2">
        By hand on macOS: quit lpm, trash <code className={CODE}>lpm.app</code>,
        delete <code className={CODE}>/usr/local/bin/lpm</code>{" "}and{" "}
        <code className={CODE}>~/.lpm</code>, then remove the lpm hooks in{" "}
        <code className={CODE}>~/.claude</code>{" "}and{" "}
        <code className={CODE}>~/.codex</code>{" "}and the lpm skills in{" "}
        <code className={CODE}>~/.claude/skills</code>{" "}and{" "}
        <code className={CODE}>~/.agents/skills</code>.
      </p>
    </>
  );
}
