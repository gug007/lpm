"use client";

import { ArrowUpRight } from "lucide-react";
import { trackGithubVisit, type GithubLinkSource } from "@/lib/analytics";
import { REPO_URL } from "@/lib/links";

type Props = {
  source: GithubLinkSource;
  className?: string;
};

export function GithubLink({ source, className }: Props) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackGithubVisit({ source, href: REPO_URL })}
      className={className}
    >
      View on GitHub
      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
    </a>
  );
}
