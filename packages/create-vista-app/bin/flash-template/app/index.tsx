import Image from 'vista/image';
import { ThemeToggle } from '../utils/theme-toggle';

export default function Index() {
  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <div className="pointer-events-none absolute top-0 right-0 h-[380px] w-[380px] translate-x-1/4 -translate-y-1/4 rounded-full bg-primary opacity-20 blur-[110px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-8 md:px-10 lg:px-12">
        <div className="absolute right-0 top-0">
          <ThemeToggle compact />
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
              Flashpack starter
            </div>
            <h1 className="mt-6 max-w-2xl text-balance text-[clamp(2.9rem,5.8vw,5rem)] font-semibold leading-[0.94] tracking-tight text-foreground">
              Stay in flow while the app keeps moving.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-8 text-muted-foreground md:text-lg">
              Flashpack keeps the Vista workflow familiar, but gives you a tighter edit loop, clearer runtime traces,
              and a cleaner place to inspect what happened during dev, build, and start.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded-full border border-border bg-panel px-4 py-2">
                Same <code>vista dev</code> workflow
              </span>
              <span className="rounded-full border border-border bg-panel px-4 py-2">
                Traceable output in <code>.flash/</code>
              </span>
              <a
                href="https://vista.xyz/docs/env"
                className="rounded-full border border-border bg-panel px-4 py-2 text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                Read the env guide
              </a>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Edit <code className="rounded bg-panel px-2 py-1 text-foreground">app/index.tsx</code> to shape this screen.
            </p>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.9rem] border border-border bg-panel-elevated/80 p-6 shadow-[0_28px_75px_rgba(0,0,0,0.22)] backdrop-blur-sm">
              <div className="mb-6 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>Vista</span>
                <span>Flashpack</span>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/vista.svg"
                  alt="Vista Logo"
                  width={600}
                  height={600}
                  priority
                  unoptimized
                  className="h-auto w-[210px] opacity-95 dark:invert sm:w-[250px] lg:w-[280px]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-[1.6rem] border border-border bg-panel p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Quicker feedback</p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Keep editing without feeling pushed into long restart cycles every time the route tree shifts.
                </p>
              </article>
              <article className="rounded-[1.6rem] border border-border bg-panel p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Readable artifacts</p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Open graph, runtime, and log output when you want to understand how the engine moved.
                </p>
              </article>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
