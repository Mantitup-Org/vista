'use client';

import { useEffect, useRef, useState } from 'react';
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
  const scrollLockRef = useRef<{
    scrollY: number;
    overflow: string;
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
  } | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const bodyStyle = document.body.style;

    if (!isOpen) {
      if (scrollLockRef.current) {
        const { scrollY, overflow, position, top, left, right, width } = scrollLockRef.current;
        bodyStyle.overflow = overflow;
        bodyStyle.position = position;
        bodyStyle.top = top;
        bodyStyle.left = left;
        bodyStyle.right = right;
        bodyStyle.width = width;
        window.scrollTo({ top: scrollY });
        scrollLockRef.current = null;
      }
      return;
    }

    if (!scrollLockRef.current) {
      scrollLockRef.current = {
        scrollY: window.scrollY,
        overflow: bodyStyle.overflow,
        position: bodyStyle.position,
        top: bodyStyle.top,
        left: bodyStyle.left,
        right: bodyStyle.right,
        width: bodyStyle.width,
      };
    }

    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollLockRef.current.scrollY}px`;
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.width = '100%';
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-panel-elevated/90 px-3 py-2 text-sm font-medium text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      >
        <Menu className="h-4 w-4" />
        Browse docs
      </button>

      {isOpen ? (
        <button
          className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        data-lenis-prevent
        aria-hidden={!isOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-[60] w-[88%] max-w-sm overflow-y-auto border-r border-border bg-background px-5 py-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] transition-transform',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <Link
            href="/docs"
            onClick={() => setIsOpen(false)}
            className="text-sm font-semibold tracking-[0.2em] text-foreground"
          >
            Vista Docs
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full border border-border bg-panel p-2 text-muted-foreground transition-colors hover:text-foreground"
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
