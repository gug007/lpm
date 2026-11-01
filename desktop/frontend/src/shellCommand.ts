const SHELLS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "tcsh",
  "csh",
  "nu",
  "elvish",
  "xonsh",
  "pwsh",
  "powershell",
  "login",
]);

/** Whether a terminal's foreground command is its shell waiting at the prompt. */
export function isShellAtPrompt(foreground: string): boolean {
  const cmd = foreground.trim();
  const exe = /^.*?\.exe\b/i.exec(cmd);
  const first = exe ? exe[0] : (cmd.split(/\s+/)[0] ?? "");
  const name = first.replace(/^-/, "").split(/[\\/]/).pop()?.replace(/\.exe$/i, "").toLowerCase() ?? "";
  return SHELLS.has(name);
}
