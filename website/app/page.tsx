import type { Metadata } from "next";
import { BeforeAfter } from "@/components/home/before-after";
import { Contributors } from "@/components/home/contributors";
import { CtaBand } from "@/components/home/cta-band";
import { DemoSection } from "@/components/home/demo";
import { DownloadSafety } from "@/components/home/download-safety";
import { Downloads } from "@/components/home/downloads";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HomeFaq } from "@/components/home/home-faq";
import { HowItWorks } from "@/components/home/how-it-works";
import { PairedDevices } from "@/components/home/paired-devices";
import { PhoneSendBar } from "@/components/home/phone-send-bar";
import { getReleaseSummary } from "@/lib/release-verification";
import { jsonLdString, youtubeLessonJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

const structuredData = [
  youtubeLessonJsonLd("lpm-in-3-minutes"),
  youtubeLessonJsonLd("add-project"),
  youtubeLessonJsonLd("start-project"),
  youtubeLessonJsonLd("add-action"),
  youtubeLessonJsonLd("switch-profiles"),
  youtubeLessonJsonLd("parallel-agents"),
];

export default async function HomePage() {
  const release = await getReleaseSummary();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection posterPriority blurb="It all runs in your browser." />
      <BeforeAfter />
      <CtaBand />
      <HowItWorks />
      <PairedDevices />
      <Features />
      <HomeFaq />
      <Contributors />
      <Downloads release={release}>
        <DownloadSafety />
      </Downloads>
      <PhoneSendBar />
    </>
  );
}
