"use client";

import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { trackGithubVisit, type GithubLinkSource } from "@/lib/analytics";
import { REPO_URL } from "@/lib/links";

type Props = {
  source: GithubLinkSource;
  className?: string;
  children?: ReactNode;
};

export function GithubLink({ source, className, children }: Props) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackGithubVisit({ source, href: REPO_URL })}
      className={className}
    >
      {children ?? "View on GitHub"}
      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
    </a>
  );
}
