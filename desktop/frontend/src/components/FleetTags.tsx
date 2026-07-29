import { fleetIdentityTags, type FleetProjectIdentity } from "../fleetIdentity";

const CHIP_CLASS =
  "shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]";

export interface FleetTagsProps {
  project: FleetProjectIdentity;
}

export function FleetTags({ project }: FleetTagsProps) {
  return (
    <>
      {fleetIdentityTags(project).map((tag) => (
        <span key={tag} className={CHIP_CLASS}>
          {tag}
        </span>
      ))}
    </>
  );
}
