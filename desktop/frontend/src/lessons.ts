export interface Lesson {
  id: string;
  title: string;
  published: string;
}

// Newest first: the Send feedback window shows the first four. The
// lesson-publish skill prints the entry to add at the top.
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
