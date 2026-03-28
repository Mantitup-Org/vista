import { getDocBySlugParts, getDocPath, getDocsNavigation } from '../../lib/docs';
import Link from 'vista/link';

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
    <article className="mx-auto max-w-4xl pb-20 pt-2">
      <header className="mb-10 rounded-2xl border border-zinc-900 bg-zinc-950/60 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
          Official Documentation
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
          Build Fast. Write Less. Ship with Control.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-300">
          Vista docs are organized using dynamic category-slug routes:{' '}
          <code>/docs/&lt;category&gt;/&lt;slug&gt;</code>. This keeps URLs stable while your
          content grows from basics to advanced runtime
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={primaryCtaHref}
            className="rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            Start with First Steps
          </Link>
          {typedApiDoc ? (
            <Link
              href={getDocPath(typedApiDoc)}
              className="rounded-full border border-zinc-700 bg-zinc-900/70 px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
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
          className="rounded-xl border border-zinc-900 bg-zinc-950/45 p-5 transition-colors hover:border-zinc-700"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Routing</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">Dynamic Slug Architecture</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Catch-all routes, slug normalization, and scalable docs URL contracts.
          </p>
        </Link>

        <Link
          href={
            typedApiDoc ? getDocPath(typedApiDoc) : '/docs/getting-started/typed-api-quickstart'
          }
          className="rounded-xl border border-zinc-900 bg-zinc-950/45 p-5 transition-colors hover:border-zinc-700"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">APIs</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">How Vista APIs Work</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Legacy route handlers + typed routers with middleware, validation, and serializers.
          </p>
        </Link>

        <Link
          href={
            fileStructureDoc
              ? getDocPath(fileStructureDoc)
              : '/docs/reference/project-file-structure'
          }
          className="rounded-xl border border-zinc-900 bg-zinc-950/45 p-5 transition-colors hover:border-zinc-700"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Structure</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">File Maps and Conventions</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Folder-by-folder responsibilities and production-safe project organization.
          </p>
        </Link>
      </section>

      <section className="space-y-5">
        {navigation.map((group) => (
          <div key={group.id} className="rounded-2xl border border-zinc-900 bg-zinc-950/55 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{group.title}</h2>
              <p className="mt-1 text-sm text-zinc-500">{group.description}</p>
            </div>
            <ul className="space-y-2">
              {group.docs.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="group flex items-start justify-between rounded-lg border border-zinc-900/80 bg-zinc-950/30 px-3 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
                  >
                    <span>
                      <span className="block text-sm font-medium text-zinc-200 group-hover:text-zinc-100">
                        {doc.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                        {doc.summary}
                      </span>
                    </span>
                    <span className="ml-4 mt-1 text-xs uppercase tracking-[0.12em] text-zinc-600">
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
