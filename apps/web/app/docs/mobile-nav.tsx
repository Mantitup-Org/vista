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
        className="inline-flex items-center gap-1.5 rounded-md border border-foreground/12 bg-background px-2.5 py-1.5 text-[13px] text-foreground/70"
      >
        <Menu className="h-3.5 w-3.5" />
        Menu
      </button>

      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[2px]"
          onClick={() => setIsOpen(false)}
          aria-label="Close menu backdrop"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[60] w-[min(86vw,18rem)] border-r border-foreground/10 bg-background p-5 transition-transform',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/docs"
            onClick={() => setIsOpen(false)}
            className="text-[13px] font-semibold tracking-tight text-foreground"
          >
            Vista Docs
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground"
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
