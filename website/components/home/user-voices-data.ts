import { DISCUSSIONS_URL } from "@/lib/links";

export type UserVoice = {
  quote: string;
  author: string;
  discussion: number;
  // The comment inside the discussion, when the words aren't in its first post.
  comment?: string;
  about?: string;
};

// Word for word from public GitHub Discussions, with "…" where words are
// left out. Ask the author before adding or keeping a quote.
export const USER_VOICES: UserVoice[] = [
  {
    quote:
      "I find the app super well thought out and really useful, the UI and UX are polished, and you have great ideas! … What impresses me the most is your speed there is almost a new update every single day.",
    author: "vincentbattez",
    discussion: 148,
  },
  {
    quote: "Great work! This looks really good and so much potential.",
    author: "Hypercubed-A1",
    discussion: 135,
  },
  {
    quote:
      "Great job so far! … I really like the themed editor, adding tree on the left…",
    author: "mawnir",
    discussion: 107,
    comment: "discussioncomment-18483676",
    about: "on the file editor",
  },
];

export const voiceUrl = ({ discussion, comment }: UserVoice): string =>
  `${DISCUSSIONS_URL}/${discussion}${comment ? `#${comment}` : ""}`;
