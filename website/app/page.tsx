import { Commands } from "@/components/home/commands";
import { ConfigExample } from "@/components/home/config-example";
import { DemoSection } from "@/components/home/demo";
import { Downloads } from "@/components/home/downloads";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { TwoWays } from "@/components/home/two-ways";

export default function HomePage() {
  return (
    <>
      <Hero />
      <DemoSection />
      <HowItWorks />
      <TwoWays />
      <Features />
      <Commands />
      <ConfigExample />
      <Downloads />
    </>
  );
}
