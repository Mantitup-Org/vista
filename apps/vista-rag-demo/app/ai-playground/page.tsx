import { RagChatBox } from './chat-box';
import { KNOWLEDGE_DOCS } from '../../lib/rag-knowledge';

export const metadata = {
  title: 'AI RAG Playground',
  description: 'Try Vista agentic RAG with React + route.ts streaming.',
};

export default function AiPlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 md:px-6">
      <div className="mb-8 max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          create-vista-app · live demo
        </p>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight md:text-4xl">
          AI RAG Playground
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Built with Vista React: Server Component page,{' '}
          <code className="text-foreground">{`'use client'`}</code> chat box, and{' '}
          <code className="text-foreground">app/api/rag-chat/route.ts</code> streaming{' '}
          <code className="text-foreground">agent().stream()</code> +{' '}
          <code className="text-foreground">createRetrieverTool</code>. Watch the same events in the
          terminal.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <RagChatBox />

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Knowledge docs loaded</h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {KNOWLEDGE_DOCS.map((doc) => (
                <li key={doc.id} className="rounded-lg bg-background/70 px-3 py-2">
                  <div className="font-mono text-[11px] text-primary">{doc.id}</div>
                  <div className="mt-1 line-clamp-3 leading-relaxed">{doc.text}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-panel p-4 text-xs leading-relaxed text-muted-foreground">
            Flow: user prompt → <span className="text-amber-700 dark:text-amber-300">tool-call</span>{' '}
            → keyword search →{' '}
            <span className="text-emerald-700 dark:text-emerald-300">tool-result</span> → streamed
            assistant answer.
          </div>
          <a href="/" className="block text-sm text-primary hover:underline">
            ← Back to home
          </a>
        </aside>
      </div>
    </main>
  );
}
