import Link from "next/link";
import {
  ArrowRight,
  Laptop,
  Server,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { FEATURES_PATH, LINUX_HOST_PATH, MOBILE_PATH } from "@/lib/links";

const CARDS: {
  icon: LucideIcon;
  href: string;
  title: string;
  body: string;
}[] = [
  {
    icon: Smartphone,
    href: MOBILE_PATH,
    title: "lpm link for iPhone",
    body: "Live terminals, the prompt composer, git review and notifications, on iPhone and iPad.",
  },
  {
    icon: Laptop,
    href: `${FEATURES_PATH}#devices`,
    title: "Connect another Mac",
    body: "Pair two Macs and the other one's projects appear in your sidebar. Start its services and run its agents from here.",
  },
  {
    icon: Server,
    href: LINUX_HOST_PATH,
    title: "Add a Linux host",
    body: "Type user@server and lpm sets itself up there. Services and agents keep running after your Mac closes.",
  },
];

export function DevicesCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CARDS.map(({ icon: Icon, href, title, body }) => (
        <Link
          key={href}
          href={href}
          className="group rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-transparent dark:hover:border-gray-700 dark:hover:bg-white/[0.02] dark:hover:shadow-none"
        >
          <span className="flex items-center gap-2.5">
            <Icon
              className="h-4 w-4 text-gray-500 dark:text-gray-400"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </span>
            <ArrowRight
              className="ml-auto h-3.5 w-3.5 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-700 dark:group-hover:text-gray-200"
              aria-hidden="true"
            />
          </span>
          <span className="mt-2 block text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            {body}
          </span>
        </Link>
      ))}
    </div>
  );
}
