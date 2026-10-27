export interface Lesson {
  id: string;
  title: string;
  published: string;
}

// Every video in the playlist, newest first, as the Send feedback window
// lists them. The lesson-publish skill prints the entry to add at the top.
export const LESSONS: readonly Lesson[] = [
  {
    id: "S0NgdCHmof8",
    title: "Sync Ignored Files in lpm: Keep Your .env the Same on Every Computer",
    published: "2026-10-27",
  },
  {
    id: "iOJNlm2Y10Y",
    title: "Run Commands From Claude Code & Codex Output in One Click — No More Copy-Paste",
    published: "2026-10-25",
  },
  {
    id: "4ekpJw1KQAI",
    title: "Automations That Ask You First: Answer and the Agent Keeps Going",
    published: "2026-10-21",
  },
  {
    id: "1an8djn43JU",
    title: "Run Claude Code & Codex on a Server — Keep Agents Running When You Close Your Laptop",
    published: "2026-10-21",
  },
  {
    id: "HeY6GDlCr90",
    title: "Run Claude Code and Codex on a Remote Server from Your Mac",
    published: "2026-10-20",
  },
  {
    id: "vflMFPmbf5s",
    title: "Share Your Claude Code Terminal with Anyone, Right in Their Browser",
    published: "2026-10-19",
  },
  {
    id: "eZoi4xTNSlg",
    title: "Dynamic Action Labels in lpm: Buttons That Show Live Info",
    published: "2026-10-13",
  },
  {
    id: "eUaxQqogl0I",
    title: "Auto Git Pull in lpm: The Complete Guide",
    published: "2026-10-12",
  },
  {
    id: "mnmC5xABT_s",
    title: "Run Any AI Coding Agent in lpm: Claude Code, Codex, Cursor, omp",
    published: "2026-10-12",
  },
  {
    id: "WWG_380qtXs",
    title: "Create an Automation",
    published: "2026-10-11",
  },
  {
    id: "-vvdAsp4JJU",
    title: "Use Multiple Claude Code Accounts and Switch Automatically",
    published: "2026-10-09",
  },
  {
    id: "OGttu6tgb0I",
    title: "Run Claude Code from Your iPhone: Connect lpm Link to Your Mac with Built-in Tailscale",
    published: "2026-10-09",
  },
  {
    id: "06CUZPBJEDA",
    title: "Let Claude Code Start Its Own Parallel Claude Codes with the lpm CLI",
    published: "2026-10-07",
  },
  {
    id: "VPxDo44-ZEU",
    title: "Claude Code Effort Levels Explained: Low vs Max vs Ultracode on Opus 5.5",
    published: "2026-10-07",
  },
  {
    id: "yPT4uCC-Cj4",
    title: "Use Claude Code and Codex Together: Claude Writes, Codex Reviews",
    published: "2026-10-07",
  },
  {
    id: "OG0wx5DHFoM",
    title: "Claude Code Notifications When Done: Sounds and Badges for Codex Too",
    published: "2026-10-07",
  },
  {
    id: "Bfrebwr-0HY",
    title: "Claude Code Resume Session: Find Any Past Conversation (Codex Too)",
    published: "2026-10-07",
  },
  {
    id: "wQop-I9eL2k",
    title: "Claude Code Auto Resume After Limit Reset (Works for Codex Too)",
    published: "2026-10-07",
  },
  {
    id: "OgfaZp6CGAg",
    title: "Turn Your Best Claude Code Prompt Into a Button: Saved Prompts, Questions and Shortcuts",
    published: "2026-10-07",
  },
  {
    id: "GxP-l1WB0X0",
    title: "Port 3000 Already in Use? See Who Holds It and Free It in One Click",
    published: "2026-10-07",
  },
  {
    id: "edfoTn3rZnQ",
    title: "Action Zones in lpm: Stack Your Buttons in Rows and Layers",
    published: "2026-10-04",
  },
  {
    id: "_eFQc4O6-Js",
    title: "Review Code Changes in the lpm Terminal",
    published: "2026-09-30",
  },
  {
    id: "zLt_56dvOsg",
    title: "Use Multiple Claude Code Accounts on One Mac",
    published: "2026-09-25",
  },
  {
    id: "y_qaWmCl1IE",
    title: "Claude Code Statusline: Show Usage Limits and Context Left in lpm",
    published: "2026-09-25",
  },
  {
    id: "TO3yguc3qAM",
    title: "Codex Statusline: Show Usage Limits and Context Left in lpm",
    published: "2026-09-24",
  },
  {
    id: "eYdMm41G3P8",
    title: "Claude Code + Codex Usage Monitor: Will You Run Out Before the Reset?",
    published: "2026-09-24",
  },
  {
    id: "IdCqjZfftV0",
    title: "Git Worktree Alternative: Duplicate Your Project with .env, node_modules and Uncommitted Work",
    published: "2026-09-24",
  },
  {
    id: "kKQiNwU5j4c",
    title: "lpm Prompt Box Tour: @-Files, Voice, AI Rewrites, Drafts, History, Fork Sessions, Model Picker",
    published: "2026-09-19",
  },
  {
    id: "H46vW5DPbZk",
    title: "lpm in 60 Seconds: Start, Stop, Switch Projects and Run AI Agents",
    published: "2026-09-19",
  },
  {
    id: "6NsF8xBY9m4",
    title: "Run Agents in Parallel in lpm: Duplicate Your Project into Two, Three, or More Copies",
    published: "2026-09-19",
  },
  {
    id: "qFdoN4-yFqY",
    title: "Switch Between Profiles in lpm: Run Only the Services You Need",
    published: "2026-09-19",
  },
  {
    id: "3MJaCcsV-8E",
    title: "Add an Action in lpm: Turn Any Command Into a One-Click Button",
    published: "2026-09-19",
  },
  {
    id: "2QUy7XbPaB0",
    title: "Edit and Add Services in lpm",
    published: "2026-09-19",
  },
  {
    id: "ysllvZN9Flo",
    title: "Start and Stop Your Dev Server in lpm: No Config, Just Click Start",
    published: "2026-09-19",
  },
  {
    id: "DBKZvb_-Cb4",
    title: "Add Your First Project: Pick a Folder or Clone a Repository",
    published: "2026-09-19",
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
