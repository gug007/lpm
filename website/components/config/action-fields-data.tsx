import { DocLink } from "./doc-link";
import type { Field } from "./field-table";

export const actionFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: false,
    description: (
      <>
        The shell command to run — whatever you&rsquo;d type into a terminal
        yourself. Required unless the action groups child actions with{" "}
        <code className="font-mono">actions</code>{" "}below.
      </>
    ),
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: (
      <>
        The friendly name shown on the button. If you skip it, lpm shows the
        action&rsquo;s key as-is — <code className="font-mono">db-reset</code>{" "}
        stays <code className="font-mono">db-reset</code>, while{" "}
        <code className="font-mono">label: Reset DB</code>{" "}reads better.
      </>
    ),
  },
  {
    name: "emoji",
    type: "string",
    required: false,
    description: (
      <>
        A single emoji shown in front of the label, so a crowded toolbar stays
        scannable. It&rsquo;s prefixed to whatever the label resolves to —{" "}
        <code className="font-mono">emoji: 🚀</code>{" "}with{" "}
        <code className="font-mono">label: Deploy</code>{" "}renders as{" "}
        <code className="font-mono">🚀 Deploy</code>.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Run the command from a different folder than the project root — useful
        for monorepos or when the action lives in a subfolder. Relative paths
        resolve from <code className="font-mono">root</code>; absolute paths
        are used as-is (see{" "}
        <DocLink href="#path-resolution">Path resolution</DocLink>). Nested
        actions inherit this from their parent.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this action — handy for
        one-off flags like{" "}
        <code className="font-mono">NODE_ENV=production</code>. Nested actions
        inherit these from their parent.
      </>
    ),
  },
  {
    name: "confirm",
    type: "bool",
    required: false,
    description: (
      <>
        Show a confirmation dialog before running. Turn this on for anything
        you&rsquo;d regret clicking by accident — deletes, resets, production
        deploys.
      </>
    ),
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        Where the action appears. The default,{" "}
        <code className="font-mono">header</code>, pins it to the project
        toolbar so it&rsquo;s always one click away — omit{" "}
        <code className="font-mono">display</code>{" "}entirely to get the same
        result. <code className="font-mono">footer</code>{" "}tucks it into the
        status bar below the terminal — handy for tight, always-visible
        controls. <code className="font-mono">menu</code>{" "}still works as a
        legacy value (overflow menu) but is no longer suggested by the editor.
      </>
    ),
  },
  {
    name: "type",
    type: "string",
    required: false,
    description: (
      <>
        How the action runs. The default pops open a modal and streams output
        while the command runs. <code className="font-mono">terminal</code>{" "}
        opens a persistent interactive pane (see the Terminals section
        below). <code className="font-mono">background</code>{" "}runs the command
        hidden behind a small live card that counts the time, keeps the output
        a click away with Cancel and Copy output, and shows success or failure
        when it finishes — perfect for slow, boring commands whose only
        interesting signal is &ldquo;did it succeed.&rdquo;{" "}
        <code className="font-mono">command</code>{" "}types the
        command into the terminal you have focused.
      </>
    ),
  },
  {
    name: "actions",
    type: "map",
    required: false,
    description: (
      <>
        Group related commands under this action. They show up as a dropdown.
        If the parent also has a <code className="font-mono">cmd</code>, it
        renders as a split button — clicking the main part runs the parent,
        clicking the chevron opens the group.
      </>
    ),
  },
  {
    name: "primary",
    type: "string",
    required: false,
    description: (
      <>
        Only for actions with nested{" "}
        <code className="font-mono">actions</code>: which child the main half of
        the split button runs. Name a child&rsquo;s key (
        <code className="font-mono">primary: staging</code>) to pin it, or use{" "}
        <code className="font-mono">last-used</code>{" "}so the button follows
        whichever child you ran most recently — remembered per project on that
        Mac. It takes precedence over the parent&rsquo;s own{" "}
        <code className="font-mono">cmd</code>.
      </>
    ),
  },
];
