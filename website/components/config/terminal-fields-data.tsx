import { DocLink } from "./doc-link";
import type { Field } from "./field-table";

export const terminalFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: (
      <>
        The shell command that starts the terminal — usually something
        interactive you want to keep around, like{" "}
        <code className="font-mono">claude</code>,{" "}
        <code className="font-mono">node</code>, or{" "}
        <code className="font-mono">tail -f ./logs/dev.log</code>. lpm opens it
        in a real PTY so prompts, colors, and arrow keys all work.
      </>
    ),
  },
  {
    name: "type",
    type: "string",
    required: true,
    description: (
      <>
        Must be <code className="font-mono">terminal</code> — this is what makes
        the entry open in a persistent pane and stay open, instead of running
        once like a plain action.
      </>
    ),
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: (
      <>
        The friendly name shown on the button. If you skip it, lpm uses the
        terminal&rsquo;s key — so <code className="font-mono">claude</code>{" "}
        just shows up as <code className="font-mono">claude</code>.
      </>
    ),
  },
  {
    name: "emoji",
    type: "string",
    required: false,
    description: (
      <>
        Same as on actions: a single emoji prefixed to the label, handy for
        telling a row of agent terminals apart at a glance —{" "}
        <code className="font-mono">emoji: 🤖</code>{" "}with{" "}
        <code className="font-mono">label: Claude Code</code>{" "}renders as{" "}
        <code className="font-mono">🤖 Claude Code</code>.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Open the terminal in a different folder than the project root — useful
        for monorepos or when your agent should start inside a specific
        package. Relative paths resolve from{" "}
        <code className="font-mono">root</code>; absolute paths are used
        as-is (see{" "}
        <DocLink href="#path-resolution">Path resolution</DocLink>).
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this terminal — handy for
        picking a model with{" "}
        <code className="font-mono">ANTHROPIC_MODEL</code>{" "}or pointing a REPL
        at a staging database. These only apply inside this shell, nothing
        else on your system is touched.
      </>
    ),
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        Same rules as actions. The default,{" "}
        <code className="font-mono">header</code>, pins the terminal to the
        project toolbar — omit <code className="font-mono">display</code>{" "}
        entirely to get the same result.{" "}
        <code className="font-mono">footer</code>{" "}tucks it into the status
        bar below the terminal. <code className="font-mono">menu</code>{" "}still
        works as a legacy value (overflow menu) but is no longer suggested by
        the editor.
      </>
    ),
  },
];
