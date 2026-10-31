import { DOCS_PAGES, findDocsPage } from "@/lib/docs-pages";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt = "A page of the lpm docs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return DOCS_PAGES.map(({ slug }) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const page = findDocsPage((await params).slug);
  return ogImage({
    headline: page?.title ?? "lpm docs",
    subline: page?.description ?? "",
    eyebrow: "Docs",
  });
}
