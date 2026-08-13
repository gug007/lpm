"use client";

import { ArrowRight } from "lucide-react";
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
      onClick={() => trackGithubVisit({ source, href: REPO_URL })}
      className={className}
    >
      View on GitHub
      <ArrowRight className="w-3.5 h-3.5" aria-hidden />
    </a>
  );
}
