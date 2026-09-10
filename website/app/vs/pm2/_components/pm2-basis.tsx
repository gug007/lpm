import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";

const SOURCES = [
  {
    href: "https://pm2.keymetrics.io/docs/usage/pm2-development/",
    label: "PM2 development docs",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/process-management/",
    label: "PM2 process-management docs",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/application-declaration/",
    label: "the ecosystem file reference",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/cluster-mode/",
    label: "PM2 cluster mode",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/restart-strategies/",
    label: "PM2 restart strategies",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/startup/",
    label: "PM2 startup script",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/log-management/",
    label: "PM2 log management",
  },
  {
    href: "https://github.com/keymetrics/pm2-logrotate",
    label: "pm2-logrotate",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/monitoring/",
    label: "PM2 monitoring",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/",
    label: "pm2-runtime in Docker",
  },
  {
    href: "https://man.openbsd.org/tmux.1",
    label: "the tmux manual",
  },
];

export function Pm2Basis() {
  return (
    <ComparisonBasis
      reviewed={VS_REVIEWED}
      reviewedIso={VS_REVIEWED_ISO}
      sources={SOURCES}
      lpmNote="The six rows PM2 wins are cited individually, because they are the reason to keep it. lpm's own rows were re-checked against the app source the same day."
    />
  );
}
