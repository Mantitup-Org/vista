import type { Metadata } from 'vista';
import { getDocBySlugParts, getDocPath, getDocsNavigation } from '../../lib/docs';
import Link from 'vista/link';
import { siteName, siteOgImage } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Official Vista documentation covering first steps, routing, typed APIs, engine variants, deployment, and framework internals.',
  alternates: {
    canonical: '/docs',
  },
  openGraph: {
    type: 'website',
    url: '/docs',
    siteName,
    title: 'Vista Documentation',
    description:
      'Official Vista documentation covering first steps, routing, typed APIs, engine variants, deployment, and framework internals.',
    images: [
      {
        url: siteOgImage,
        alt: 'Vista logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vista Documentation',
    description:
      'Official Vista documentation covering first steps, routing, typed APIs, engine variants, deployment, and framework internals.',
    images: [siteOgImage],
  },
};

export default function DocsPage() {
  const navigation = getDocsNavigation();
  const firstStepsDoc = getDocBySlugParts(['getting-started', 'first-steps']);
  const typedApiDoc = getDocBySlugParts(['getting-started', 'typed-api-quickstart']);
  const fileStructureDoc = getDocBySlugParts(['reference', 'project-file-structure']);
  const dynamicRoutesDoc = getDocBySlugParts(['core-concepts', 'dynamic-routes-and-slugs']);
  const primaryCtaHref = firstStepsDoc
    ? getDocPath(firstStepsDoc)
    : navigation[0]?.docs[0]?.href || '/docs/introduction/the-beginning-of-vista';

  return (
    <article className="mx-auto max-w-4xl pb-20 pt-1">
      <header className="mb-8 rounded-[2rem] border border-border bg-panel-elevated/85 p-7 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Official Documentation
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Build Fast. Write Less. Ship with Control.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
          Start from the basics, understand how Vista works, and move toward real production
          patterns with clear guides, practical examples, and ready-to-use code snippets.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={primaryCtaHref}
            prefetch={true}
            className="rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            Start with First Steps
          </Link>
          {typedApiDoc ? (
            <Link
              href={getDocPath(typedApiDoc)}
              prefetch={true}
              className="rounded-full border border-border bg-panel px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-panel-elevated"
            >
              Typed API Quickstart
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mb-10 grid gap-4 md:grid-cols-3">
        <Link
          href={
            dynamicRoutesDoc
              ? getDocPath(dynamicRoutesDoc)
              : '/docs/core-concepts/dynamic-routes-and-slugs'
          }
          className="rounded-[1.6rem] border border-border bg-panel-elevated/80 p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Routing</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Dynamic Slug Architecture</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Catch-all routes, slug normalization, and scalable docs URL contracts.
          </p>
        </Link>

        <Link
          href={
            typedApiDoc ? getDocPath(typedApiDoc) : '/docs/getting-started/typed-api-quickstart'
          }
          className="rounded-[1.6rem] border border-border bg-panel-elevated/80 p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">APIs</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">How Vista APIs Work</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Legacy route handlers + typed routers with middleware, validation, and serializers.
          </p>
        </Link>

        <Link
          href={
            fileStructureDoc
              ? getDocPath(fileStructureDoc)
              : '/docs/reference/project-file-structure'
          }
          className="rounded-[1.6rem] border border-border bg-panel-elevated/80 p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Structure</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">File Maps and Conventions</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Folder-by-folder responsibilities and production-safe project organization.
          </p>
        </Link>
      </section>

      <section className="space-y-5">
        {navigation.map((group) => (
          <div key={group.id} className="rounded-[1.8rem] border border-border bg-panel-elevated/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{group.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            </div>
            <ul className="space-y-2">
              {group.docs.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="group flex items-start justify-between rounded-2xl border border-border bg-background/70 px-4 py-3 transition-colors hover:bg-background"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {doc.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {doc.summary}
                      </span>
                    </span>
                    <span className="ml-4 mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </article>
  );
}
