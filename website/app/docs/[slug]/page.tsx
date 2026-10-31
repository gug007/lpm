import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS_CONTENT } from "@/components/docs/docs-content";
import { DocsPager } from "@/components/docs/docs-pager";
import { DocsShell } from "@/components/docs/docs-shell";
import { DOCS_PAGES, docsPath, findDocsPage } from "@/lib/docs-pages";
import { DOCS_PATH } from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS_PAGES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findDocsPage((await params).slug);
  if (!page) return {};
  const title = `${page.title} — lpm docs`;
  const path = docsPath(page.slug);
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: page.description,
      type: "article",
      url: path,
      siteName: "lpm",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
    },
  };
}

export default async function DocsArticlePage({ params }: Props) {
  const { slug } = await params;
  const page = findDocsPage(slug);
  if (!page) notFound();
  const Content = DOCS_CONTENT[page.slug];

  const path = docsPath(page.slug);
  const structuredData = [
    webPageJsonLd({
      title: `${page.title} — lpm docs`,
      description: page.description,
      path,
    }),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Docs", path: DOCS_PATH },
      { name: page.title, path },
    ]),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <DocsShell current={slug}>
        <Content />
        <DocsPager slug={slug} />
      </DocsShell>
    </>
  );
}
