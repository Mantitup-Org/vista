'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'vista/link';
import { usePathname } from 'vista/navigation';
import type { DocsNavigationGroup } from '../../lib/docs';
import { cn } from '../../lib/utils';
import DocNavigation from './doc-navigation';

interface MobileNavigationProps {
  navigation: DocsNavigationGroup[];
}

export default function MobileNavigation({ navigation }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Ensure the backdrop never persists across route transitions.
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-sm text-zinc-200"
      >
        <Menu className="h-4 w-4" />
        Menu
      </button>

      {isOpen ? <button className="fixed inset-0 z-50 bg-black/70" onClick={() => setIsOpen(false)} /> : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[60] w-[86%] max-w-xs border-r border-zinc-800 bg-black p-4 transition-transform',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3">
          <Link
            href="/docs"
            onClick={() => setIsOpen(false)}
            className="text-sm font-semibold tracking-wide text-zinc-100"
          >
            Vista Docs
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            aria-label="Close docs navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <DocNavigation navigation={navigation} onNavigate={() => setIsOpen(false)} />
      </aside>
    </>
  );
}
