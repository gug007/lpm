import { ConfigExample } from "@/components/home/config-example";
import { DemoSection } from "@/components/home/demo";
import { Downloads } from "@/components/home/downloads";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";

export default function HomePage() {
  return (
    <>
      <Hero />
      <DemoSection />
      <HowItWorks />
      <Features />
      <ConfigExample />
      <Downloads />
    </>
  );
}
