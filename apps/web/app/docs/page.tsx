import { getDocBySlugParts, getDocPath, getDocsNavigation } from '../../lib/docs';
import Link from 'vista/link';
import type { Metadata } from 'vista';
import { absoluteUrl, siteName, siteOgImage } from '../../lib/site';

const docsDescription =
  'Official Vista docs: React apps, fullstack APIs, auth, AI agents, RAG, deployment, and SEO.';

export const metadata: Metadata = {
  title: 'Documentation',
  description: docsDescription,
  alternates: {
    canonical: '/docs',
  },
  openGraph: {
    type: 'website',
    url: '/docs',
    title: 'Documentation',
    description: docsDescription,
    siteName,
    images: [{ url: siteOgImage, width: 1200, height: 630, alt: 'Vista documentation' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Documentation',
    description: docsDescription,
    images: [absoluteUrl(siteOgImage)],
  },
};

export default function DocsPage() {
  const navigation = getDocsNavigation();
  const firstStepsDoc = getDocBySlugParts(['getting-started', 'first-steps']);
  const reactAppDoc = getDocBySlugParts(['getting-started', 'react-app']);
  const fullstackDoc = getDocBySlugParts(['getting-started', 'fullstack-app']);
  const aiOverviewDoc = getDocBySlugParts(['ai', 'overview']);
  const primaryCtaHref = firstStepsDoc
    ? getDocPath(firstStepsDoc)
    : navigation[0]?.docs[0]?.href || '/docs/introduction/the-beginning-of-vista';

  return (
    <article className="mx-auto max-w-3xl pb-16">
      <header className="border-b border-foreground/10 pb-8">
        <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.75rem]">
          Vista Docs
        </h1>
        <p className="mt-3 text-lg leading-8 text-foreground/60">
          Welcome to the Vista documentation.
        </p>
      </header>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What is Vista?</h2>
        <p className="text-[15px] leading-7 text-foreground/70">
          Vista is a React framework for building full-stack apps. You start with pages under{' '}
          <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[13px]">
            app/
          </code>
          , then grow into APIs, auth, and agents without leaving the same project.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Get started</h2>
        <ul className="space-y-2 border-l border-foreground/10">
          <li>
            <Link
              href={primaryCtaHref}
              className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              First Steps
            </Link>
          </li>
          {reactAppDoc ? (
            <li>
              <Link
                href={getDocPath(reactAppDoc)}
                className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                React App
              </Link>
            </li>
          ) : null}
          {fullstackDoc ? (
            <li>
              <Link
                href={getDocPath(fullstackDoc)}
                className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                Fullstack App
              </Link>
            </li>
          ) : null}
          {aiOverviewDoc ? (
            <li>
              <Link
                href={getDocPath(aiOverviewDoc)}
                className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                AI Overview
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="mt-12 space-y-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Browse by topic</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {navigation.map((group) => (
            <div key={group.id}>
              <h3 className="text-[13px] font-semibold text-foreground">{group.title}</h3>
              <ul className="mt-2 space-y-1">
                {group.docs.slice(0, 4).map((doc) => (
                  <li key={doc.href}>
                    <Link
                      href={doc.href}
                      className="text-[13px] text-foreground/55 transition-colors hover:text-foreground"
                    >
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
