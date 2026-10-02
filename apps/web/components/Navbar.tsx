'use client';

import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import Link from 'vista/link';
import Image from 'vista/image';
import { siteConfig } from '@/data/site';
import { ThemeToggle } from '../utils/theme-toggle';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b border-foreground/10 bg-background transition-shadow duration-300 ${
        isScrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/vista.svg"
            width={104}
            height={34}
            alt={`${siteConfig.name} Logo`}
            className="dark:invert"
            style={{ width: '104px', height: 'auto' }}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {siteConfig.nav.map((item) =>
            item.href.startsWith('/') ? (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
              >
                {item.title}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
              >
                {item.title}
              </a>
            )
          )}

          <ThemeToggle compact className="hidden sm:inline-flex" />

          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Star on GitHub"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.08]"
          >
            <Github className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
