import Image from 'vista/image';

export default function Index() {
  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-black text-zinc-100 selection:bg-primary/20 selection:text-primary">
      <div className="pointer-events-none absolute top-0 right-0 h-[380px] w-[380px] translate-x-1/4 -translate-y-1/4 rounded-full bg-primary opacity-20 blur-[110px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10 md:px-10 lg:px-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-primary">
              Flashpack starter
            </div>
            <h1 className="mt-6 max-w-2xl text-balance text-[clamp(2.9rem,5.8vw,5rem)] font-semibold leading-[0.94] tracking-tight text-zinc-50">
              Stay in flow while the app keeps moving.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-8 text-zinc-400 md:text-lg">
              Flashpack keeps the Vista workflow familiar, but gives you a tighter edit loop, clearer runtime traces,
              and a cleaner place to inspect what happened during dev, build, and start.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-2">
                Same <code>vista dev</code> workflow
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-4 py-2">
                Traceable output in <code>.flash/</code>
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <span>
                Edit <code className="rounded bg-zinc-900 px-2 py-1 text-zinc-200">app/index.tsx</code> to shape this
                screen.
              </span>
              <a
                href="https://vista.xyz/docs/env"
                className="rounded-full border border-zinc-800 bg-zinc-950/70 px-4 py-2 text-zinc-200 transition-colors hover:border-primary/50 hover:text-primary"
              >
                Read the env guide
              </a>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.9rem] border border-zinc-800/80 bg-zinc-950/60 p-6 shadow-[0_28px_75px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <div className="mb-6 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-zinc-500">
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
                  className="h-auto w-[210px] invert opacity-95 sm:w-[250px] lg:w-[280px]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-[1.6rem] border border-zinc-800/80 bg-zinc-950/45 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Quicker feedback</p>
                <p className="mt-3 text-sm leading-7 text-zinc-400">
                  Keep editing without feeling pushed into long restart cycles every time the route tree shifts.
                </p>
              </article>
              <article className="rounded-[1.6rem] border border-zinc-800/80 bg-zinc-950/45 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Readable artifacts</p>
                <p className="mt-3 text-sm leading-7 text-zinc-400">
                  Open graph, runtime, and log output when you want to understand how the engine moved.
                </p>
              </article>
            </div>

            <div className="rounded-[1.6rem] border border-zinc-800/80 bg-zinc-950/45 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Why teams pick it</p>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Flashpack keeps the command surface stable while making build artifacts and dev behavior easier to read.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
