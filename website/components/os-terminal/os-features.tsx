import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

export type OsFeature = {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  features: OsFeature[];
};

export function OsFeatures({ eyebrow, title, description, features }: Props) {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {features.map(({ icon, title: featureTitle, body }) => (
            <FeatureCard key={featureTitle} icon={icon} title={featureTitle}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
