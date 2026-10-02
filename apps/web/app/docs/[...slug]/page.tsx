import { ActiveSectionObserver } from '../../../components/active-section-observer';
import { Code } from '../../../components/mdx/code';
import { allDocs } from 'content-collections';
import Link from 'vista/link';
import type { Metadata } from 'vista';
import { JsonLd } from 'vista/metadata';
import type { DocsDocSection } from '../../../content/docs';
import { getCategoryById, getDocNeighbors, getDocPath, normalizeDocRouteSlug } from '../../../lib/docs';
import { absoluteUrl, siteName, siteOgImage, siteUrl } from '../../../lib/site';
import { slugify } from '../../../lib/utils';
import SignatureBlock from '../signature-block';

type RouteParams = Record<string, string | string[] | undefined | null>;

interface DocsArticlePageProps {
  params?: RouteParams | Promise<RouteParams>;
}

function isExternalHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(href);
}

function resolveRouteParams(input: DocsArticlePageProps['params']): RouteParams {
  if (!input || typeof (input as Promise<RouteParams>).then === 'function') {
    return {};
  }
  return input;
}

function renderNotFound() {
  return (
    <article className="mx-auto max-w-3xl pb-16">
      <h1 className="text-[2.5rem] font-semibold tracking-[-0.03em] text-foreground">Doc not found</h1>
      <p className="mt-3 text-[15px] leading-7 text-foreground/60">
        The page you are trying to open does not exist yet, or the slug is invalid.
      </p>
      <Link
        href="/docs"
        className="mt-8 inline-flex text-[15px] font-medium text-foreground underline-offset-4 hover:underline"
      >
        Back to docs home
      </Link>
    </article>
  );
}

function renderSection(section: DocsDocSection, index: number, headingId: string) {
  if (section.type === 'heading') {
    if (section.level === 2) {
      return (
        <h2
          key={`heading-${headingId}-${index}`}
          id={headingId}
          data-doc-heading={section.text}
          data-level="2"
          className="scroll-mt-28 border-t border-foreground/10 pt-8 text-[1.35rem] font-semibold tracking-tight text-foreground first:border-t-0 first:pt-0"
        >
          {section.text}
        </h2>
      );
    }

    return (
      <h3
        key={`heading-${headingId}-${index}`}
        id={headingId}
        data-doc-heading={section.text}
        data-level="3"
        className="scroll-mt-28 pt-2 text-lg font-semibold tracking-tight text-foreground"
      >
        {section.text}
      </h3>
    );
  }

  if (section.type === 'paragraph') {
    return (
      <p key={`paragraph-${index}`} className="text-[15px] leading-7 text-foreground/70">
        {section.text}
      </p>
    );
  }

  if (section.type === 'list') {
    return (
      <ul key={`list-${index}`} className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/70">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (section.type === 'code') {
    return <Code key={`code-${index}`} language={section.language} title={section.title} code={section.code} />;
  }

  if (section.type === 'quote') {
    return (
      <blockquote
        key={`quote-${index}`}
        className="border-l-2 border-foreground/25 pl-4 text-[15px] leading-7 text-foreground/65"
      >
        {section.text}
      </blockquote>
    );
  }

  return (
    <div key={`links-${index}`} className="space-y-2">
      {section.title ? <p className="text-[13px] font-medium text-foreground/80">{section.title}</p> : null}
      <ul className="space-y-1 border-l border-foreground/10">
        {section.links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            {link.external || isExternalHref(link.href) ? (
              <a
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="-ml-px block border-l border-transparent py-1 pl-4 text-[14px] text-foreground/65 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                className="-ml-px block border-l border-transparent py-1 pl-4 text-[14px] text-foreground/65 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function generateStaticParams() {
  return allDocs.map((doc) => ({
    slug: doc._meta.path.split('/'),
  }));
}

export function generateMetadata({ params }: DocsArticlePageProps): Metadata {
  const resolvedParams = resolveRouteParams(params);
  const slugParts = normalizeDocRouteSlug(resolvedParams);
  const slugPath = slugParts.join('/');
  const doc = allDocs.find((entry) => entry._meta.path === slugPath);

  if (!doc) {
    return {
      title: 'Doc not found',
      robots: { index: false, follow: false },
    };
  }

  const pathname = getDocPath(doc);
  const title = doc.title;
  const description = doc.summary;

  return {
    title,
    description,
    alternates: {
      canonical: pathname,
    },
    openGraph: {
      type: 'article',
      url: pathname,
      title,
      description,
      siteName,
      images: [{ url: siteOgImage, width: 1200, height: 630, alt: `${title} | ${siteName}` }],
      publishedTime: doc.updatedAt,
      modifiedTime: doc.updatedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl(siteOgImage)],
    },
  };
}

export default function DocsArticlePage({ params }: DocsArticlePageProps) {
  const resolvedParams = resolveRouteParams(params);
  const slugParts = normalizeDocRouteSlug(resolvedParams);
  const slugPath = slugParts.join('/');
  const doc = allDocs.find((entry) => entry._meta.path === slugPath);

  if (!doc) {
    return renderNotFound();
  }

  const category = getCategoryById(doc.category);
  const headings = doc.headings;
  const { prev, next } = getDocNeighbors(doc);
  const showFounderNote = doc._meta.path === 'introduction/the-beginning-of-vista';
  let headingIndex = 0;
  const pathname = getDocPath(doc);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.title,
    description: doc.summary,
    dateModified: doc.updatedAt,
    datePublished: doc.updatedAt,
    author: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
    },
    mainEntityOfPage: absoluteUrl(pathname),
    image: [absoluteUrl(siteOgImage)],
  };

  return (
    <>
      <ActiveSectionObserver headings={headings} />
      <JsonLd data={articleJsonLd} />
      <article className="mx-auto max-w-3xl pb-16">
        <header className="mb-10 border-b border-foreground/10 pb-8">
          <p className="text-[13px] font-medium text-foreground/45">
            {category?.title ?? doc.category}
          </p>
          <h1
            id={slugify(doc.title)}
            className="mt-2 scroll-mt-28 text-[2.35rem] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[2.6rem]"
          >
            {doc.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-foreground/60">{doc.summary}</p>
        </header>

        {showFounderNote ? (
          <div className="mb-10">
            <SignatureBlock quote={doc.signatureQuote} />
          </div>
        ) : null}

        <div className="space-y-5">
          {doc.sections.map((section, index) => {
            const headingId =
              section.type === 'heading'
                ? headings[headingIndex++]?.id || slugify(section.id || section.text)
                : `section-${index}`;
            return renderSection(section, index, headingId);
          })}
        </div>

        <nav className="mt-14 grid gap-6 border-t border-foreground/10 pt-8 sm:grid-cols-2">
          {prev ? (
            <Link href={getDocPath(prev)} className="group block min-w-0">
              <p className="text-[12px] text-foreground/40">Previous</p>
              <p className="mt-1 truncate text-[15px] font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                ← {prev.title}
              </p>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}
          {next ? (
            <Link href={getDocPath(next)} className="group block min-w-0 text-right sm:justify-self-end">
              <p className="text-[12px] text-foreground/40">Next</p>
              <p className="mt-1 truncate text-[15px] font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                {next.title} →
              </p>
            </Link>
          ) : null}
        </nav>
      </article>
    </>
  );
}
