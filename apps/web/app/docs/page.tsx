import { getDocBySlugParts, getDocPath, getDocsNavigation } from '../../lib/docs';
import Link from 'vista/link';

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
    <article className="mx-auto max-w-4xl pb-20 pt-2">
      <header className="mb-10 rounded-2xl border border-foreground/12 bg-foreground/[0.035] p-7 shadow-[0_20px_60px_rgba(15,23,42,0.06)] dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
          Official Documentation
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Build a React app. Grow it into fullstack, auth, and AI.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/74">
          Start with pages under <code>app/</code>. Add <code>route.ts</code> or{' '}
          <code>vista g api-init</code> for APIs, <code>vista g auth</code> for sessions, and{' '}
          <code>vista g agent</code> for chat and RAG. Same project, no second server.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={primaryCtaHref}
            className="rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            Start with First Steps
          </Link>
          {fullstackDoc ? (
            <Link
              href={getDocPath(fullstackDoc)}
              className="rounded-full border border-foreground/12 bg-background/80 px-5 py-2 text-sm font-medium text-foreground/86 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.04]"
            >
              Fullstack App
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mb-10 grid gap-4 md:grid-cols-3">
        <Link
          href={
            reactAppDoc
              ? getDocPath(reactAppDoc)
              : '/docs/getting-started/react-app'
          }
          className="rounded-xl border border-foreground/12 bg-foreground/[0.025] p-5 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.02]"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">React</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Build a React App</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/64">
            Pages, layouts, Server Components, and client UI under app/ — no backend required.
          </p>
        </Link>

        <Link
          href={
            fullstackDoc ? getDocPath(fullstackDoc) : '/docs/getting-started/fullstack-app'
          }
          className="rounded-xl border border-foreground/12 bg-foreground/[0.025] p-5 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.02]"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">Fullstack</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">APIs, auth, middleware</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/64">
            route.ts, typed procedures, vista g auth, and fail-closed middleware in the same app.
          </p>
        </Link>

        <Link
          href={
            aiOverviewDoc
              ? getDocPath(aiOverviewDoc)
              : '/docs/ai/overview'
          }
          className="rounded-xl border border-foreground/12 bg-foreground/[0.025] p-5 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.02]"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">AI</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Agents and RAG</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/64">
            vista g agent, Groq and NVIDIA models, embeddings, and retrieval over your docs.
          </p>
        </Link>
      </section>

      <section className="space-y-5">
        {navigation.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl border border-foreground/12 bg-foreground/[0.03] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] dark:bg-white/[0.025]"
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{group.title}</h2>
              <p className="mt-1 text-sm text-foreground/55">{group.description}</p>
            </div>
            <ul className="space-y-2">
              {group.docs.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="group flex items-start justify-between rounded-lg border border-foreground/10 bg-background/65 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.02]"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground/90 group-hover:text-foreground">
                        {doc.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-foreground/55">
                        {doc.summary}
                      </span>
                    </span>
                    <span className="ml-4 mt-1 text-xs uppercase tracking-[0.12em] text-foreground/40">
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
