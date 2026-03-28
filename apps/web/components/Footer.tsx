import { siteConfig } from '../data/site';
import Image from 'vista/image';
import Link from 'vista/link';

export default function Footer() {
    return (
        <footer className="mt-auto w-full px-4 pb-8 pt-14 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl rounded-[2rem] border border-border bg-panel-elevated/85 px-6 py-8 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Vista
                        </p>
                        <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
                            A cleaner full-stack React workflow with RSC, typed APIs, and an engine path that stays readable.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <Link
                            href="/docs"
                            className="rounded-full border border-border bg-background/70 px-4 py-2 text-foreground transition-colors hover:bg-background"
                        >
                            Documentation
                        </Link>
                        <a
                            href={siteConfig.links.github}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-border bg-background/70 px-4 py-2 text-foreground transition-colors hover:bg-background"
                        >
                            GitHub
                        </a>
                    </div>
                </div>

                <div className="my-8 h-px bg-border" />

                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <Image
                        src="/vista.svg"
                        alt="Vista Logo"
                        width={180}
                        height={60}
                        className="h-auto w-[150px] dark:invert"
                    />
                    <div className="text-sm font-medium tracking-tight text-muted-foreground">
                        &copy; {new Date().getFullYear()} {siteConfig.footer.copyright}
                    </div>
                </div>
            </div>
        </footer>
    );
}
