import Image from 'vista/image';

export default function Index() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-8 text-foreground selection:bg-primary/15 selection:text-primary md:px-10">
      <section className="relative w-full max-w-5xl rounded-[2rem] border border-border bg-panel-elevated/90 p-7 shadow-[0_24px_80px_rgba(27,18,7,0.08)] backdrop-blur-sm md:p-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
              Vista RAG demo
            </div>
            <h1 className="mt-6 max-w-xl text-balance text-[clamp(2.6rem,5vw,4.6rem)] font-semibold tracking-tight text-foreground">
              Agentic RAG on a fresh <code className="font-mono text-[0.82em]">create-vista-app</code>
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base leading-8 text-muted-foreground md:text-lg">
              Scaffolded with the CLI, wired to local <code>packages/vista</code>, and ready to show
              tool-call → retrieval → streamed answer in the UI and terminal.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="/ai-playground"
                className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
              >
                Open AI RAG Playground
              </a>
              <span className="rounded-full border border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                No API key required
              </span>
            </div>
          </div>

          <aside className="rounded-[1.7rem] border border-border bg-background/70 p-6">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              <span>Stack</span>
              <span>Vista + AI</span>
            </div>

            <div className="mt-6 flex justify-center">
              <Image
                src="/vista.svg"
                alt="Vista Logo"
                width={600}
                height={600}
                priority
                unoptimized
                className="h-auto w-[220px] opacity-95 sm:w-[250px]"
              />
            </div>

            <div className="mt-7 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border bg-panel p-4">
                <p className="font-medium text-foreground">React page + client chat</p>
                <p className="mt-2 leading-7">
                  <code>app/ai-playground/page.tsx</code> + <code>chat-box.tsx</code>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-panel p-4">
                <p className="font-medium text-foreground">File-based API route</p>
                <p className="mt-2 leading-7">
                  <code>app/api/rag-chat/route.ts</code> streams SSE to the UI
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
