export const YOUTUBE_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLGgzBw1aFVk8";

const LESSONS = {
  "add-project": {
    id: "AWd3UbKqCSI",
    name: "Add Your First Project in lpm: Pick a Local Folder or Clone a Git Repository",
    description:
      "Add your first project to lpm on your Mac: open a folder that's already on disk, or clone a Git repository by pasting its URL. lpm finds the dev server in package.json, and every new project opens ready to start Claude Code or Codex in it.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "start-project": {
    id: "-QsKc192DJ4",
    name: "Start and Stop Your Dev Server in lpm: No Config, Just Click Start",
    description:
      "Start your local dev server in lpm with one click, and stop it with the same button. lpm reads the dev script in package.json, or the processes in a Procfile, when you add the folder, so there's no config to write. A project with several services (an API, a web app and a background worker) starts with the same click, shows side by side in the All view, or starts just one service from the menu next to Start. Then click the port on a service's tab, and your app opens right inside lpm.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "edit-services": {
    id: "IBuykjB50pQ",
    name: "Edit and Add Services in lpm",
    description:
      "When you add a project, lpm turns its dev command into a service, a command it keeps running while you work. This video fixes that service in a form (open the menu next to Start, click the pencil, set the port it serves on, and choose what happens when the port is busy), then adds the API lpm missed, starts both with one click, and opens the running shop right inside lpm.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "add-action": {
    id: "N2aFWV_dYqI",
    name: "Add an Action in lpm: Turn Any Command Into a One-Click Button",
    description:
      "Turn any command you keep typing into a one-click button in lpm. Click + Action in a project's header, give the action a name and the command exactly as you'd type it in a terminal, choose how it runs, and click Create action. Click your new button and its output pops up in a card right under it, or it runs quietly in the background with a notice in the corner. lpm also suggests your package.json scripts, so a Build button takes one click, and a right-click moves, edits or deletes any action.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "switch-profiles": {
    id: "vxMuocYi-OE",
    name: "Switch Between Profiles in lpm: Run Only the Services You Need",
    description:
      "Run only the services you need in lpm: save the ones you use every day as a profile, and switch a running project between profiles with one click, no config file. storefront runs an API, a web app, a background worker and Storybook; a profile called everyday runs just the API and the web app, and full brings all four back.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "parallel-agents": {
    id: "CIg-rOI1rR4",
    name: "Run Agents in Parallel in lpm: Duplicate Your Project into Two, Three, or More Copies",
    description:
      "Run Claude Code and Codex in parallel on the same codebase with lpm: duplicate a project into two, three or more copies, give each copy its own AI coding agent and its own task, and watch them work side by side.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "multiple-accounts": {
    id: "TosPjfynD5o",
    name: "Use Multiple Claude Code Accounts on One Mac",
    description:
      "Claude Code keeps one login per Mac, so a second subscription usually means /logout, /login, and every terminal moving with you. lpm keeps a separate login for each Claude account, lets every project pick the account its sessions run on, and shows each account's 5-hour and weekly limits, so you can move a project to another account when one runs low.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "accounts-switching": {
    id: "5r3Rx55xgtk",
    name: "Switch Claude Code Accounts Automatically Before You Hit a Limit",
    description:
      "With two Claude Code subscriptions on one Mac, lpm can move new Claude sessions to your next account by itself when one gets close to its 5-hour or weekly limit. Turn on Switch accounts automatically in Settings → Accounts & usage, confirm each account is yours alone, put your accounts in turn order, and choose whether lpm asks first or switches on its own. Sessions already running stay on their account; only new ones move, and they go back to the first account once its limit resets.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "codex-statusline": {
    id: "DjqD9-ZWjXs",
    name: "Codex Statusline: Show Usage Limits and Context Left in lpm",
    description:
      "See how much context is left and how much of your Codex 5-hour and weekly usage limits remains, right in the Codex CLI status line under the prompt. This lesson sets the status line up in lpm's visual editor, with no config.toml editing: pick the Usage layout, remove what you don't need, then open a fresh Codex session to see your own numbers and watch them change after one answer.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "claude-statusline": {
    id: "n_YupNvB0iM",
    name: "Claude Code Statusline: Show Usage Limits and Context Left in lpm",
    description:
      "Turn on a Claude Code statusline in lpm that shows how much context your chat has left and how much of your 5-hour and weekly usage limits you've used, right above the box you type in. Pick a layout, learn to read it, trim it, and the Claude Code session you already have open picks it up without a restart.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "review-code-changes": {
    id: "052osNYl05U",
    name: "Review Code Changes in the lpm Terminal",
    description:
      "Claude Code edits the files in your project folder and commits nothing. lpm shows every change it made as a diff right next to the terminal, so you can read each line, undo a file you don't want, and commit the rest from the same window.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "action-zones": {
    id: "mbOih5HiU7w",
    name: "Action Zones in lpm: Stack Your Buttons in Rows and Layers",
    description:
      "Too many action buttons in your lpm header? A zone gives a group of them a framed spot of its own, up to three rows tall, with layers you flip between and a fold that turns the whole zone into one button. Everything here is done from right-click menus: start a zone from a button, name it and set its height, move buttons in, add named layers, then fold it away.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "connect-iphone": {
    id: "6tiTDB6XynM",
    name: "Run Claude Code from Your iPhone: Connect lpm Link to Your Mac with Built-in Tailscale",
    description:
      "Run Claude Code on your Mac from your iPhone, at home or on cellular. Step by step: turn on Remote control in lpm, set up Built-in Tailscale on the Mac and in the free lpm Link app, pair the two, send Claude Code a prompt from your phone, take the session back on your Mac, and reconnect away from home.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "create-an-automation": {
    id: "2Ov4_0Hu1jQ",
    name: "Create an Automation",
    description:
      "Create an automation in lpm, step by step: an AI agent that checks a project's code on a schedule, on its own, and keeps what it found for you to read. Name it, write the prompt, pick Claude Code, the model and the effort, choose the project it runs in and whether it may change files, set it to every weekday evening, then run it once right away and read the result.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "run-any-ai-coding-agent": {
    id: "0sH6QHobYbo",
    name: "Run Any AI Coding Agent in lpm: Claude Code, Codex, Cursor and More",
    description:
      "Claude Code and Codex come built into lpm, and any other AI coding agent you run in a terminal can join them as a button in the project header. Here Cursor's command line agent is added with + Action, a name and the command you'd type, then runs side by side with Claude Code in the same project, both answering the same question while the sidebar tracks each one. Gemini CLI, OpenCode or any other terminal agent works the same way.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "auto-pull-complete-guide": {
    id: "qH5J5hdOqYw",
    name: "Auto Git Pull in lpm: The Complete Guide",
    description:
      "lpm can pull your teammates' commits into your local projects by itself. A blue arrow in the sidebar shows that origin has new commits; rest the pointer on it and turn on auto pull for all projects or just one. From then on each background check pulls new commits in by itself, with a note you can undo, and the project's Git menu keeps an Undo auto pull too. Auto pull only ever fast-forwards: it waits while you have uncommitted changes, while you have commits of your own to push, and while an agent is working in the project. Turn it off for one project from its Git menu, or choose Off, Chosen or All in Settings › Git.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "dynamic-action-labels": {
    id: "PFqMprk44cs",
    name: "Dynamic Action Labels in lpm: Buttons That Show Live Info",
    description:
      "Make lpm's action buttons show live information. In an action's name, double braces hold variables lpm fills in from Git, like {{git.tag}} and {{git.tagAge}} for your last release and how long ago it was, or {{git.nextPatch}} for the version a release will make, and a $(command) shows the first line any command prints, like a count of the to-do comments in your code. Everything is done in the action form: edit a Release button so it reads Release v1.4.2 (3d ago), watch it update by itself after a release, and add a To-dos button whose label counts them. Git variables follow Git on their own; commands run again every minute and after any background action in the project.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "share-terminal-in-browser": {
    id: "pxhm-rVTcF8",
    name: "Share Your Claude Code Terminal with Anyone, Right in Their Browser",
    description:
      "Share a Claude Code terminal tab from lpm with anyone: they follow it live in their browser with nothing to install, and type in it with you once you let them. Click Share, send the link, check the four emoji, let them in, and stop sharing whenever you like.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "claude-code-codex-remote-server": {
    id: "C2VwywMpLK8",
    name: "Run Claude Code and Codex on a Remote Server from Your Mac",
    description:
      "Run Claude Code and Codex on a remote Linux server and work with them from lpm on your Mac: click + above your projects, choose Server, type what you'd type after ssh, and lpm installs itself there and pairs over SSH. The server's projects show in your sidebar and open like local ones, while the agents run on the server.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "keep-agents-running-on-server": {
    id: "uiOIrquoGwg",
    name: "Run Claude Code & Codex on a Server — Keep Agents Running When You Close Your Laptop",
    description:
      "Close your laptop and Claude Code stops. Run it on an always-on machine with lpm instead, a Mac mini or a Linux server, and it keeps working: connect the server, start Claude Code and Codex there, close the lid, and come back to finished work.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "automations-that-ask-you-first": {
    id: "NREK5dZTpj4",
    name: "Automations That Ask You First: Answer and the Agent Keeps Going",
    description:
      "Let an lpm automation stop and ask you before it makes a call that's yours. Say when to ask right in its prompt; when the agent needs you, the Automations row says Needs you and a notice brings its question. Answer with one click, or in your own words, and Claude Code picks up in the same conversation, remembering everything it read.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "run-agent-commands-in-one-click": {
    id: "Kyrp0XHf_70",
    name: "Run Commands From Claude Code & Codex Output in One Click — No More Copy-Paste",
    description:
      "Claude Code and Codex end their answers with commands to run: npm test, npm run dev, a clean reinstall. In lpm you don't copy them into another terminal: hover a command and click Run to see its output in a card, open a long-running one in a new tab, or ⌘-click it to run it straight away. Risky commands like rm -rf ask once more first.",
    uploadDate: "2026-10-30T09:00:00+00:00",
  },
  "sync-ignored-files": {
    id: "S0NgdCHmof8",
    name: "Sync Ignored Files in lpm: Keep Your .env the Same on Every Computer",
    description:
      "Git leaves your .env files, local config and certificates behind, so a second computer can't run the project. Sync Ignored Files in lpm copies what git ignores between your computers, shows what differs key by key, and keeps the ticked files the same from then on.",
    uploadDate: "2026-10-27T09:00:00+00:00",
  },
  "lpm-in-3-minutes": {
    id: "hM9ArXSLITo",
    name: "lpm in 3 Minutes: Dev Servers, Claude Code and Codex in One Window",
    description:
      "A three-minute tour of lpm, the desktop app that runs your local dev servers and AI coding agents like Claude Code and Codex in one window. Start a whole stack in one click, free a busy port, ask two agents side by side, run them in parallel copies of a project, then review and commit the best result.",
    uploadDate: "2026-10-28T09:00:00+00:00",
  },
} as const;

export type YouTubeLessonId = keyof typeof LESSONS;

export type YouTubeLesson = (typeof LESSONS)[YouTubeLessonId];

export const youtubeLesson = (id: YouTubeLessonId): YouTubeLesson =>
  LESSONS[id];

export const youtubeWatchUrl = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${videoId}`;

export const youtubeEmbedUrl = (videoId: string): string =>
  `https://www.youtube-nocookie.com/embed/${videoId}`;

export const youtubeThumbnailUrl = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
