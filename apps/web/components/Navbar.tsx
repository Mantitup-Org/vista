'use client';
import { useState, useEffect } from 'react';
import { Github } from 'lucide-react';
import Link from 'vista/link';
import Image from 'vista/image';
import { siteConfig } from '../data/site';
import { ThemeToggle } from '../utils/theme-toggle';

export default function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 16);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className="fixed left-0 top-0 z-50 w-full px-3 py-3 md:px-5">
            <div
                className={`mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full border px-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)] transition-all md:px-5 ${isScrolled
                    ? 'border-border bg-panel-elevated/92 backdrop-blur-xl'
                    : 'border-transparent bg-transparent'
                    }`}
            >
                <Link href="/" className="flex items-center gap-3">
                    <div className="rounded-full border border-border bg-panel px-3 py-2">
                        <Image
                            src="/vista.svg"
                            width={112}
                            height={36}
                            alt={`${siteConfig.name} Logo`}
                            className="h-auto w-[112px] dark:invert"
                            style={{ width: '112px', height: 'auto' }}
                        />
                    </div>
                    <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground md:inline-flex">
                        Framework
                    </span>
                </Link>

                <div className="flex items-center gap-2 md:gap-3">
                    {siteConfig.nav.map((item) => (
                        item.href.startsWith('/') ? (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="hidden rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-panel hover:text-foreground sm:inline-flex"
                            >
                                {item.title}
                            </Link>
                        ) : (
                            <a
                                key={item.href}
                                href={item.href}
                                className="hidden rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-panel hover:text-foreground sm:inline-flex"
                            >
                                {item.title}
                            </a>
                        )
                    ))}

                    <ThemeToggle compact className="hidden sm:inline-flex" />

                    <a
                        href={siteConfig.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-panel-elevated"
                    >
                        <Github className="w-4 h-4" />
                        <span className="hidden md:inline">GitHub</span>
                    </a>
                </div>
            </div>
        </nav>
    );
}
