'use client';

import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import Link from 'vista/link';
import Image from 'vista/image';
import { siteConfig } from '../data/site';
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
      className={`fixed top-0 left-0 z-50 w-full transition-all duration-300 ${
        isScrolled ? 'bg-black/50 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <a href="/" className="flex items-center gap-2">
          <Image
            src="/vista.svg"
            width={120}
            height={40}
            alt={`${siteConfig.name} Logo`}
            className="relative z-10 invert"
            style={{ width: '120px', height: 'auto' }}
          />
        </a>

        <div className="flex items-center gap-4 md:gap-6">
          {siteConfig.nav.map((item) =>
            item.href.startsWith('/') ? (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
              >
                {item.title}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
              >
                {item.title}
              </a>
            )
          )}

          <div className="h-6 w-[1px] bg-zinc-800" />

          <ThemeToggle compact className="hidden sm:inline-flex" />

          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <Github className="h-4 w-4" />
            <span className="hidden md:inline">Star on GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
