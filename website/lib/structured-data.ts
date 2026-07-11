import { SITE_URL } from "@/lib/links";

const absoluteUrl = (path: string): string =>
  path === "/" ? SITE_URL : `${SITE_URL}${path}`;

type WebPageInput = {
  title: string;
  description: string;
  path: string;
  about?: string[];
};

export function webPageJsonLd({ title, description, path, about }: WebPageInput) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: absoluteUrl(path),
    description,
    isPartOf: {
      "@type": "WebSite",
      name: "lpm",
      url: SITE_URL,
    },
    ...(about ? { about } : {}),
  };
}

type FaqItem = {
  question: string;
  answer: string;
};

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

type BreadcrumbItem = {
  name: string;
  path: string;
};

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
