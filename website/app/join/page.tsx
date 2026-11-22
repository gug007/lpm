import type { Metadata } from "next";
import { JoinSharedTab } from "./_components/join-shared-tab";

const TITLE = "Join a live terminal tab";
const DESCRIPTION =
  "Someone shared a terminal tab from lpm. Open it in the lpm app or in your browser, and the person sharing it lets you in.";

// Invites are pasted into chats, which preview this page: the card says what
// the link is rather than advertising the app. The invite itself is in the
// fragment, so every invite shares this one card.
export const metadata: Metadata = {
  title: "Join a shared tab",
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/join",
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function JoinPage() {
  return <JoinSharedTab />;
}
