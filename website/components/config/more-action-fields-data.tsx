import { DocLink } from "./doc-link";
import type { Field } from "./field-table";

const C = "font-mono";

export const moreActionFields: Field[] = [
  {
    name: "color",
    type: "string",
    required: false,
    description: (
      <>
        An accent for the button and the tab it opens: a name like{" "}
        <code className={C}>blue</code>, <code className={C}>claude</code>{" "}or{" "}
        <code className={C}>rose</code>, the same name plus{" "}
        <code className={C}>-deep</code>, or any CSS color (quote a leading{" "}
        <code className={C}>#</code>).
      </>
    ),
  },
  {
    name: "shortcut",
    type: "string",
    required: false,
    description: (
      <>
        A key combo that runs the action while the project is open, like{" "}
        <code className={C}>cmd+shift+b</code>.
      </>
    ),
  },
  {
    name: "inputs",
    type: "map",
    required: false,
    description: (
      <>
        Values lpm asks for before running — text, password, or a choice of
        options — filled into the command wherever{" "}
        <code className={C}>{"{{key}}"}</code>{" "}appears.
      </>
    ),
  },
  {
    name: "prompt",
    type: "string",
    required: false,
    description: (
      <>
        On a terminal that starts Claude Code, Codex, Gemini CLI, or OpenCode:
        the task sent to the agent once it&rsquo;s ready.
      </>
    ),
  },
  {
    name: "reuse",
    type: "bool",
    required: false,
    description: (
      <>
        On a terminal: use the pane that&rsquo;s already open instead of
        opening a new one each click.
      </>
    ),
  },
  {
    name: "labelRefresh",
    type: "string",
    required: false,
    description: (
      <>
        How often commands in a <code className={C}>label</code>{" "}or{" "}
        <code className={C}>emoji</code>{" "}run, like{" "}
        <code className={C}>5m</code>. See dynamic labels below.
      </>
    ),
  },
  {
    name: "position",
    type: "number",
    required: false,
    description: (
      <>
        Order among the buttons of its bar, or inside its{" "}
        <DocLink href="#zones">zone</DocLink>. Lower comes first.
      </>
    ),
  },
  {
    name: "port",
    type: "number | list",
    required: false,
    description: (
      <>
        Ports that must be free before running: a number, a range like{" "}
        <code className={C}>&quot;3002-3010&quot;</code>, or a list.{" "}
        <code className={C}>portConflict</code>{" "}says what to do when one is
        taken: <code className={C}>ask</code>, <code className={C}>free</code>,
        or <code className={C}>fail</code>.
      </>
    ),
  },
  {
    name: "mode",
    type: "string",
    required: false,
    description: (
      <>
        SSH projects only: <code className={C}>remote</code>{" "}runs on the host;{" "}
        <code className={C}>sync</code>{" "}copies the project here, runs the
        command on this computer, and syncs the changes back.
      </>
    ),
  },
];
