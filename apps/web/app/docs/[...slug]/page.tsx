import { ActiveSectionObserver } from '../../../components/active-section-observer';
import { Code } from '../../../components/mdx/code';
import { allDocs } from 'content-collections';
import Link from 'vista/link';
import type { DocsDocSection } from '../../../content/docs';
import { getCategoryById, getDocNeighbors, getDocPath, normalizeDocRouteSlug } from '../../../lib/docs';
import { slugify } from '../../../lib/utils';
import SignatureBlock from '../signature-block';

type RouteParams = Record<string, string | string[] | undefined | null>;

interface DocsArticlePageProps {
  params?: RouteParams | Promise<RouteParams>;
}

function isExternalHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(href);
}

async function resolveRouteParams(input: DocsArticlePageProps['params']): Promise<RouteParams> {
  if (!input) return {};
  return Promise.resolve(input);
}

function renderNotFound() {
  return (
    <article className="mx-auto max-w-3xl pb-16 pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Documentation</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100">Doc not found</h1>
      <p className="mt-4 text-base leading-7 text-zinc-400">
        The page you are trying to open does not exist yet, or the slug is invalid.
      </p>
      <Link
        href="/docs"
        className="mt-8 inline-flex rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
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
          className="scroll-mt-40 text-2xl font-semibold tracking-tight text-zinc-100"
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
        className="scroll-mt-40 text-xl font-semibold tracking-tight text-zinc-100"
      >
        {section.text}
      </h3>
    );
  }

  if (section.type === 'paragraph') {
    return (
      <p key={`paragraph-${index}`} className="text-base leading-8 text-zinc-300">
        {section.text}
      </p>
    );
  }

  if (section.type === 'list') {
    return (
      <ul key={`list-${index}`} className="list-disc space-y-2 pl-5 text-base leading-8 text-zinc-300">
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
        className="rounded-xl border-l-4 border-primary/70 bg-zinc-950/70 px-5 py-4 text-lg leading-8 text-zinc-200"
      >
        {section.text}
      </blockquote>
    );
  }

  return (
    <div key={`links-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      {section.title ? <p className="mb-3 text-sm font-medium text-zinc-300">{section.title}</p> : null}
      <ul className="space-y-2">
        {section.links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            {link.external || isExternalHref(link.href) ? (
              <a
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="text-sm text-primary transition-colors hover:text-primary/80"
              >
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="text-sm text-primary transition-colors hover:text-primary/80">
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

export default async function DocsArticlePage({ params }: DocsArticlePageProps) {
  const resolvedParams = await resolveRouteParams(params);
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

  return (
    <ActiveSectionObserver headings={headings}>
      <article className="mx-auto max-w-3xl pb-12 pt-2">
        <header className="mb-10 border-b border-zinc-900 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {category?.title ?? doc.category}
          </p>
          <h1
            id={headings[0]?.id || slugify(doc.title)}
            data-doc-heading={doc.title}
            data-level="1"
            className="mt-3 scroll-mt-40 text-4xl font-semibold tracking-tight text-zinc-100"
          >
            {doc.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">{doc.summary}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-zinc-500">Updated: {doc.updatedAt}</p>
        </header>

        {showFounderNote ? (
          <div className="mb-10">
            <SignatureBlock quote={doc.signatureQuote} />
          </div>
        ) : null}

        <div className="space-y-6">
          {doc.sections.map((section, index) => {
            const headingId =
              section.type === 'heading'
                ? headings[headingIndex++]?.id || slugify(section.id || section.text)
                : `section-${index}`;
            return renderSection(section, index, headingId);
          })}
        </div>

        {headings.length === 0 ? (
          <p className="mt-8 rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-500">
            This page currently has no generated heading map for TOC.
          </p>
        ) : null}

        <nav className="mt-12 grid gap-3 border-t border-zinc-900 pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={getDocPath(prev)}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Previous</p>
              <p className="mt-1 text-sm font-medium text-zinc-200">{prev.title}</p>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}
          {next ? (
            <Link
              href={getDocPath(next)}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-right transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Next</p>
              <p className="mt-1 text-sm font-medium text-zinc-200">{next.title}</p>
            </Link>
          ) : null}
        </nav>
      </article>
    </ActiveSectionObserver>
  );
}
