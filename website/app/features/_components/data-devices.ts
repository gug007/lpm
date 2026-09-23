import {
  BellRing,
  Laptop,
  MessageSquareText,
  Server,
  Smartphone,
  SquareTerminal,
} from "lucide-react";
import { LINUX_HOST_PATH, SSH_TERMINAL_MAC_PATH } from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const DEVICES_AREA: FeatureArea = {
  id: "devices",
  title: "Drive projects on another Mac, a server, or over SSH",
  description:
    "Work runs where the project lives, and lpm on your Mac is the screen and keyboard. Machines connect to each other directly, not through a cloud relay.",
  highlights: [
    {
      icon: Laptop,
      title: "Connect Macs",
      body: "Pair two Macs and the other Mac's projects appear in your sidebar under its name. Start its services, use its terminals and agents, review its changes, and run its actions.",
      note: "Both Macs run lpm, and the host turns on “Allow control of this Mac”.",
    },
    {
      icon: Server,
      title: "A Linux host from one SSH string",
      body: "Type user@server and lpm installs itself there, pairs, and connects through SSH. Services and agents keep running on the server after your Mac closes.",
      href: LINUX_HOST_PATH,
      linkLabel: "Run agents on a server",
    },
    {
      icon: SquareTerminal,
      title: "SSH projects",
      body: "Add a project on any machine you can SSH into, picked from your SSH config or typed in. Its terminals, services, and actions run there, and Claude Code and Codex report their status back.",
      note: "lpm itself isn't installed on the server. SSH projects can't be duplicated.",
      href: SSH_TERMINAL_MAC_PATH,
      linkLabel: "The SSH terminal",
    },
  ],
  features: [
    {
      title: "Pair the way that suits you",
      body: "Paste a one-time invite, type an address and code by hand, or tap a nearby Mac and confirm the same 6-digit code on both screens.",
    },
    {
      title: "Pinned, revocable connections",
      body: "When both sides run a current lpm, connections are encrypted and pinned to each machine's identity, so a different machine at the same address is refused. Revoke any device at any time.",
    },
    {
      title: "Away from home with Tailscale",
      body: "Invites carry your Tailscale address next to your LAN address, so paired machines reach each other over your tailnet.",
      note: "You set up Tailscale; lpm detects the address.",
    },
    {
      title: "Sync to This Mac",
      body: "Mirror a project from another Mac into a local copy that follows its branch and uncommitted edits within seconds, so you can build and test it here.",
      note: "One-way: the other Mac always wins.",
    },
    {
      title: "Config sync between Macs",
      body: "Compare and sync lpm settings, global config, and presets between paired machines, with a preview and a backup first, or keep them in sync automatically.",
      note: "Syncs lpm setup, never your source code.",
    },
    {
      title: "SSH port forwarding",
      body: "Ports your services declare forward to localhost automatically, and ports lpm spots on the server show up as one-click suggestions.",
    },
    {
      title: "SSH that reconnects",
      body: "SSH terminals share one connection per host with keepalives and reconnect on their own. A reconnect starts a fresh remote shell.",
    },
    {
      title: "Files to remote terminals",
      body: "Drop or paste files into a terminal on another Mac, a Linux host, or an SSH server, and lpm uploads them and pastes the remote path.",
    },
    {
      title: "Server alerts on your Mac",
      body: "When an agent on a Linux host finishes or needs you, your Mac plays the chime and shows the banner as if it ran locally.",
    },
    {
      title: "Manage Linux hosts",
      body: "See the lpm version on each host, update or reinstall it from your Mac, install the agent skills there, or remove it.",
    },
    {
      title: "Remote folders in your editor",
      body: "Open an SSH project straight in VS Code, Cursor, or Windsurf through their remote SSH support.",
    },
    {
      title: "Take control",
      body: "A terminal open in several places is controlled from one at a time. Take control moves it to the window, Mac, or phone you're on.",
    },
  ],
};

export const IPHONE_AREA: FeatureArea = {
  id: "iphone",
  title: "Your terminals and agents, in your pocket",
  description:
    "The free lpm link app for iPhone and iPad mirrors terminals, sends prompts, and tells you when an agent needs you. Everything still runs on your Mac or Linux host.",
  highlights: [
    {
      icon: Smartphone,
      title: "Live terminals",
      body: "Open any terminal running on your Mac and watch it live with 10,000 lines of scrollback. Tap to type into it, with extra keys for Esc, Tab, Ctrl-C, and the arrows.",
    },
    {
      icon: BellRing,
      title: "Push notifications",
      body: "Get a push when an agent waits for you, finishes, or errors, and optionally when automations run. Content is encrypted on your Mac and only your phone can read it.",
      note: "Agent alerts come from Claude Code and Codex.",
    },
    {
      icon: MessageSquareText,
      title: "A real prompt composer",
      body: "Multi-line prompts land as one message, with photos, files, / commands, and @ mentions. Drafts sync with the same terminal on your Mac.",
    },
  ],
  features: [
    {
      title: "Agent status and Activity",
      body: "See each project's agents as Needs you, Working, Done, or Problem, and one Activity list of agents, automations, and running services.",
    },
    {
      title: "Start, stop, and run actions",
      body: "Start a project or a profile, toggle single services, read service logs, and run actions with their inputs and confirmations.",
    },
    {
      title: "Review and ship",
      body: "Review uncommitted diffs, commit chosen files with an AI-written message, pull, push, switch branches, and open a GitHub pull request.",
    },
    {
      title: "Ask an agent about a diff",
      body: "From any changed file, send an instruction plus that file's diff to an agent terminal.",
    },
    {
      title: "Copies from your phone",
      body: "Make 1 to 50 folder copies with an optional task in each, or hold down Send to fan one prompt out 2 to 10 ways.",
    },
    {
      title: "Automations on the go",
      body: "Create, edit, run, pause, and reply to automations, and read each run as a conversation.",
    },
    {
      title: "Usage, stats, notes, memory",
      body: "Check Claude and Codex plan limits and token stats, and read or write project notes and memory sessions.",
    },
    {
      title: "Easy pairing",
      body: "Scan a QR code, tap a nearby Mac and match a code, or type the details in. Pair several Macs and Linux servers and switch between them.",
    },
    {
      title: "Home and away",
      body: "Keep a home address and a Tailscale address for each machine; the app connects to whichever answers.",
      note: "Your Mac has to be awake.",
    },
    {
      title: "Manage terminal tabs",
      body: "Open a new terminal, and rename, pin, reorder, or close tabs from your phone.",
      note: "Needs the lpm window open on your Mac.",
    },
    {
      title: "iPhone and iPad",
      body: "Runs on iPhone and iPad in portrait or landscape, with eight terminal themes and adjustable font size.",
    },
    {
      title: "Try the demo",
      body: "Explore sample projects, terminals, agents, and diffs before pairing anything.",
    },
  ],
};
