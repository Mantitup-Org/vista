import type { Metadata } from 'vista';
import Features from '@/components/Features';
import CopyCommand from '@/components/CopyCommand';
import { siteDescription, siteName, siteOgImage, siteTitle } from '@/lib/site';
import { ThemeToggle } from '@/utils/theme-toggle';

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: siteOgImage,
        alt: 'Vista logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [siteOgImage],
  },
};

export default function Index() {
  return (
    <main className="relative overflow-hidden pt-24 selection:bg-primary/15 selection:text-primary">
      <div className="pointer-events-none absolute right-0 top-0 h-[420px] w-[420px] translate-x-1/4 -translate-y-1/4 rounded-full bg-primary opacity-20 blur-[120px]" />

      <section className="relative px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 rounded-[2rem] border border-border bg-panel-elevated/85 px-6 py-10 shadow-[0_30px_80px_rgba(15,23,42,0.07)] md:px-8 lg:grid-cols-[minmax(0,1.15fr)_340px] lg:px-10">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                Official Vista Framework
              </p>
              <h1 className="mt-5 text-balance text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.92] tracking-tight text-foreground">
                The React framework for teams that want clarity and speed.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                Vista combines server rendering, typed APIs, app-router ergonomics, and a clean engine story without making the first week feel heavy.
              </p>

              <CopyCommand />
            </div>

            <aside className="rounded-[1.7rem] border border-border bg-background/70 p-5 shadow-[0_18px_38px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Theme
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Light, dark, and system mode are now part of the official Vista web shell.
                  </p>
                </div>
              </div>

              <ThemeToggle className="mt-5" />

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-border bg-panel px-4 py-4">
                  <p className="text-sm font-medium text-foreground">Package + CLI aligned</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    The shared web shell and starter templates now move together instead of drifting.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-panel px-4 py-4">
                  <p className="text-sm font-medium text-foreground">Flashpack-ready starter</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    The same theme primitives now feed the default starter and the Flashpack variant.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Features />
    </main>
  );
}
