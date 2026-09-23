import { CLAUDE_ACCOUNTS_PATH, SSH_TERMINAL_MAC_PATH } from "@/lib/links";
import { DocLink } from "./doc-link";
import type { Field } from "./field-table";

export const projectFields: Field[] = [
  {
    name: "name",
    type: "string",
    required: false,
    description: (
      <>
        The project&rsquo;s name — what the sidebar shows unless you set a{" "}
        <code className="font-mono">label</code>, and what the{" "}
        <code className="font-mono">lpm</code>{" "}CLI calls it. Defaults to the
        config file&rsquo;s name, so <code className="font-mono">myapp.yml</code>{" "}
        is the project <code className="font-mono">myapp</code>. Changing it in
        the app&rsquo;s config editor renames the file.
      </>
    ),
  },
  {
    name: "root",
    type: "string",
    required: true,
    description: (
      <>
        The folder on your computer where this project lives. Every relative
        path in the config (like <code className="font-mono">cwd</code>) is
        resolved from here. <code className="font-mono">~</code>{" "}is a shortcut
        for your home directory (e.g.{" "}
        <code className="font-mono">~/Projects/myapp</code>). Required for
        local projects; an SSH project has an{" "}
        <code className="font-mono">ssh</code>{" "}block instead.
      </>
    ),
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: (
      <>
        The name the app shows for the project, when you want something
        friendlier than <code className="font-mono">name</code>. Renaming a
        project in the app changes this, not the file name.
      </>
    ),
  },
  {
    name: "ssh",
    type: "map",
    required: false,
    description: (
      <>
        Makes this an SSH project: services, actions, and terminals run on a
        remote machine instead of this Mac.{" "}
        <code className="font-mono">host</code>{" "}and{" "}
        <code className="font-mono">user</code>{" "}are required;{" "}
        <code className="font-mono">port</code>{" "}defaults to 22;{" "}
        <code className="font-mono">key</code>{" "}points to an identity file
        (leave it out to use ssh-agent or your{" "}
        <code className="font-mono">~/.ssh/config</code>);{" "}
        <code className="font-mono">dir</code>{" "}is the remote working folder.
        More in{" "}
        <DocLink href={SSH_TERMINAL_MAC_PATH}>SSH projects on a Mac</DocLink>.
      </>
    ),
  },
  {
    name: "claudeAccount",
    type: "string",
    required: false,
    description: (
      <>
        Id of the Claude account this project&rsquo;s terminals, actions, and
        AI features use. Accounts are managed in the desktop app under Settings
        &rarr; AI &amp; Integrations, which also writes this field for you via
        the project form. Omit it to use your main Claude login. Not applied to
        SSH projects — the remote host has its own Claude login. See{" "}
        <DocLink href={CLAUDE_ACCOUNTS_PATH}>
          multiple Claude Code accounts
        </DocLink>
        .
      </>
    ),
  },
];
