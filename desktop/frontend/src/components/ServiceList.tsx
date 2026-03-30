import type { ServiceInfo } from "../types";

interface ServiceListProps {
  services: ServiceInfo[];
}

export function ServiceList({ services }: ServiceListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      {services.map((service, i) => (
        <div
          key={service.name}
          className={`flex items-center gap-4 px-4 py-3 ${
            i > 0 ? "border-t border-[var(--border)]" : ""
          }`}
        >
          <span className="w-28 shrink-0 text-sm font-medium text-[var(--text-primary)]">
            {service.name}
          </span>
          <span className="flex-1 truncate text-sm text-[var(--text-secondary)]">
            {service.cmd}
          </span>
          {service.port > 0 && (
            <span className="shrink-0 text-sm text-[var(--accent-cyan)]">
              :{service.port}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
