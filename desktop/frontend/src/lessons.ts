export interface Lesson {
  id: string;
  title: string;
  published: string;
}

// Every video in the playlist, newest first, as the Send feedback window
// lists them. The lesson-publish skill prints the entry to add at the top.
export const LESSONS: readonly Lesson[] = [
  {
    id: "Kyrp0XHf_70",
    title: "Run Commands From Claude Code & Codex Output in One Click — No More Copy-Paste",
    published: "2026-10-30",
  },
  {
    id: "NREK5dZTpj4",
    title: "Automations That Ask You First: Answer and the Agent Keeps Going",
    published: "2026-10-30",
  },
  {
    id: "uiOIrquoGwg",
    title: "Run Claude Code & Codex on a Server — Keep Agents Running When You Close Your Laptop",
    published: "2026-10-30",
  },
  {
    id: "C2VwywMpLK8",
    title: "Run Claude Code and Codex on a Remote Server from Your Mac",
    published: "2026-10-30",
  },
  {
    id: "pxhm-rVTcF8",
    title: "Share Your Claude Code Terminal with Anyone, Right in Their Browser",
    published: "2026-10-30",
  },
  {
    id: "PFqMprk44cs",
    title: "Dynamic Action Labels in lpm: Buttons That Show Live Info",
    published: "2026-10-30",
  },
  {
    id: "qH5J5hdOqYw",
    title: "Auto Git Pull in lpm: The Complete Guide",
    published: "2026-10-30",
  },
  {
    id: "0sH6QHobYbo",
    title: "Run Any AI Coding Agent in lpm: Claude Code, Codex, Cursor and More",
    published: "2026-10-30",
  },
  {
    id: "2Ov4_0Hu1jQ",
    title: "Create an Automation",
    published: "2026-10-30",
  },
  {
    id: "5r3Rx55xgtk",
    title: "Switch Claude Code Accounts Automatically Before You Hit a Limit",
    published: "2026-10-30",
  },
  {
    id: "6tiTDB6XynM",
    title: "Run Claude Code from Your iPhone: Connect lpm Link to Your Mac with Built-in Tailscale",
    published: "2026-10-30",
  },
  {
    id: "7JkFgwb8R2s",
    title: "Let Claude Code Start Its Own Parallel Claude Codes with the lpm CLI",
    published: "2026-10-30",
  },
  {
    id: "4eY0Jik3J8w",
    title: "Claude Code Effort Levels Explained: Low vs Max vs Ultracode on Opus 5.5",
    published: "2026-10-30",
  },
  {
    id: "a5VXnVppGp4",
    title: "Use Claude Code and Codex Together: Claude Writes, Codex Reviews",
    published: "2026-10-30",
  },
  {
    id: "Owx2b6s5QDU",
    title: "Claude Code Notifications When Done: Sounds and Badges for Codex Too",
    published: "2026-10-30",
  },
  {
    id: "_F_JhurA2vw",
    title: "Claude Code Resume Session: Find Any Past Conversation (Codex Too)",
    published: "2026-10-30",
  },
  {
    id: "3kr1qX1dZTo",
    title: "Claude Code Auto Resume After Limit Reset (Works for Codex Too)",
    published: "2026-10-30",
  },
  {
    id: "exMMrKMddHY",
    title: "Turn Your Best Claude Code Prompt Into a Button: Saved Prompts, Questions and Shortcuts",
    published: "2026-10-30",
  },
  {
    id: "NaX3C4ZYu50",
    title: "Port 3000 Already in Use? See Who Holds It and Free It in One Click",
    published: "2026-10-30",
  },
  {
    id: "mbOih5HiU7w",
    title: "Action Zones in lpm: Stack Your Buttons in Rows and Layers",
    published: "2026-10-30",
  },
  {
    id: "052osNYl05U",
    title: "Review Code Changes in the lpm Terminal",
    published: "2026-10-30",
  },
  {
    id: "TosPjfynD5o",
    title: "Use Multiple Claude Code Accounts on One Mac",
    published: "2026-10-30",
  },
  {
    id: "n_YupNvB0iM",
    title: "Claude Code Statusline: Show Usage Limits and Context Left in lpm",
    published: "2026-10-30",
  },
  {
    id: "DjqD9-ZWjXs",
    title: "Codex Statusline: Show Usage Limits and Context Left in lpm",
    published: "2026-10-30",
  },
  {
    id: "dAR_ztnB3pU",
    title: "Claude Code + Codex Usage Monitor: Will You Run Out Before the Reset?",
    published: "2026-10-30",
  },
  {
    id: "EPKvt3N4mq0",
    title: "Git Worktree Alternative: Duplicate Your Project with .env, node_modules and Uncommitted Work",
    published: "2026-10-30",
  },
  {
    id: "CeCJYMt6c_c",
    title: "lpm Prompt Box Tour: @-Files, Voice, AI Rewrites, Drafts, History, Fork Sessions, Model Picker",
    published: "2026-10-30",
  },
  {
    id: "CIg-rOI1rR4",
    title: "Run Agents in Parallel in lpm: Duplicate Your Project into Two, Three, or More Copies",
    published: "2026-10-30",
  },
  {
    id: "vxMuocYi-OE",
    title: "Switch Between Profiles in lpm: Run Only the Services You Need",
    published: "2026-10-30",
  },
  {
    id: "N2aFWV_dYqI",
    title: "Add an Action in lpm: Turn Any Command Into a One-Click Button",
    published: "2026-10-30",
  },
  {
    id: "IBuykjB50pQ",
    title: "Edit and Add Services in lpm",
    published: "2026-10-30",
  },
  {
    id: "-QsKc192DJ4",
    title: "Start and Stop Your Dev Server in lpm: No Config, Just Click Start",
    published: "2026-10-30",
  },
  {
    id: "AWd3UbKqCSI",
    title: "Add Your First Project in lpm: Pick a Local Folder or Clone a Git Repository",
    published: "2026-10-30",
  },
  {
    id: "hM9ArXSLITo",
    title: "lpm in 3 Minutes: Dev Servers, Claude Code and Codex in One Window",
    published: "2026-10-28",
  },
  {
    id: "S0NgdCHmof8",
    title: "Sync Ignored Files in lpm: Keep Your .env the Same on Every Computer",
    published: "2026-10-27",
  },
];

export const MAKER_X_URL = "https://x.com/gurgenabagyan";
export const MAKER_LINKEDIN_URL = "https://www.linkedin.com/in/gug007/";

export const lessonUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export const lessonThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** "Oct 21". Read as a calendar day so the viewer's time zone can't move it. */
export function lessonDate(published: string): string {
  const [year, month, day] = published.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
