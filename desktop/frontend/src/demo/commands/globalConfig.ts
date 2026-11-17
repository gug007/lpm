import type { CommandMap } from "../backend";

// What a fresh install writes to ~/.lpm/global.yml (src-tauri firstlaunch.rs).
let globalYml = `actions:
  claude:
    label: Claude
    emoji: ✻
    cmd: claude
    type: terminal
    color: claude
  codex:
    label: Codex
    emoji: ◆
    cmd: codex
    type: terminal
    color: cyan-deep
`;

export const globalConfigCommands: CommandMap = {
  read_global_config: () => globalYml,
  save_global_config: ({ content }) => {
    globalYml = String(content);
    return null;
  },
};
