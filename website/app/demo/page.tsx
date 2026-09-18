import type { Metadata } from "next";
import { EmptyDemo } from "./_components/empty-demo";

export const metadata: Metadata = {
  title: "Demo",
  description:
    "An empty lpm workspace running in your browser — add a project and click around.",
  robots: { index: false, follow: true },
};

export default function DemoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-24 sm:px-6">
      <EmptyDemo />
    </main>
  );
}
