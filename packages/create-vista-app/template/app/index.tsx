import Image from 'vista/image';
import { ThemeToggle } from '../utils/theme-toggle';

export default function Index() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-8 text-foreground selection:bg-primary/15 selection:text-primary md:px-10">
      <section className="relative w-full max-w-5xl rounded-[2rem] border border-border bg-panel-elevated/90 p-7 shadow-[0_24px_80px_rgba(27,18,7,0.08)] backdrop-blur-sm md:p-10">
        <div className="absolute right-5 top-5">
          <ThemeToggle compact />
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
              Vista starter
            </div>
            <h1 className="mt-6 max-w-xl text-balance text-[clamp(2.6rem,5vw,4.6rem)] font-semibold tracking-tight text-foreground">
              Start by editing <code className="font-mono text-[0.82em]">app/index.tsx</code>.
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base leading-8 text-muted-foreground md:text-lg">
              The default starter keeps the first screen calm: one route, a clean app shell, and the core Vista flow
              already wired so you can start building instead of cleaning up scaffolding.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="https://vista.xyz/docs/env"
                className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
              >
                Open env guide
              </a>
              <span className="rounded-full border border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                Engine lives in <code>vista.config.ts</code>
              </span>
            </div>
          </div>

          <aside className="rounded-[1.7rem] border border-border bg-background/70 p-6">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              <span>Default engine</span>
              <span>Vista</span>
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
                <p className="font-medium text-foreground">Stable default path</p>
                <p className="mt-2 leading-7">Use the familiar <code>vista dev</code>, <code>vista build</code>, and <code>vista start</code> flow from day one.</p>
              </div>
              <div className="rounded-2xl border border-border bg-panel p-4">
                <p className="font-medium text-foreground">Config-first workflow</p>
                <p className="mt-2 leading-7">Adjust engine and framework behavior in <code>vista.config.ts</code> instead of rewriting scripts.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
