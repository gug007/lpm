"use client";

import Script from "next/script";
import { useState } from "react";
import { REPO_URL } from "@/lib/links";

export function GitHubStarButton() {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <a
        className={`github-button text-[13px] relative top-[3px] transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        href={REPO_URL}
        data-icon="octicon-star"
        data-show-count="true"
        aria-label="Star gug007/lpm on GitHub"
      >
        GitHub
      </a>
      <Script
        src="https://buttons.github.io/buttons.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
