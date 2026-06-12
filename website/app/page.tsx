import type { Metadata } from "next";
import { ConfigExample } from "@/components/home/config-example";
import { CtaBand } from "@/components/home/cta-band";
import { DemoSection } from "@/components/home/demo";
import { Downloads } from "@/components/home/downloads";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HomeFaq } from "@/components/home/home-faq";
import { HowItWorks } from "@/components/home/how-it-works";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <DemoSection />
      <HowItWorks />
      <CtaBand />
      <Features />
      <ConfigExample />
      <HomeFaq />
      <Downloads />
    </>
  );
}
