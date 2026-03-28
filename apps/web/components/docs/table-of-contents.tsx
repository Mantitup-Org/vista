'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, ChevronDown, X } from 'lucide-react';
import { usePathname } from 'vista/navigation';
import { useTableOfContents } from '../../ctx/use-table-of-contents';
import { cn } from '../../lib/utils';

interface HeadingEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TableOfContentsProps {
  mode?: 'desktop' | 'mobile-trigger';
}

export default function TableOfContents({ mode = 'desktop' }: TableOfContentsProps) {
  const pathname = usePathname() || '';
  const headings = useTableOfContents((state) => state.allHeadings as HeadingEntry[]);
  const visibleSections = useTableOfContents((state) => state.visibleSections);
  const setVisibleSections = useTableOfContents((state) => state.setVisibleSections);
  const setAllHeadings = useTableOfContents((state) => state.setAllHeadings);
  const activeId = visibleSections[0] || '';
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => {
    const parts = pathname.split('/').filter(Boolean);
    const isDocsArticleRoute = parts.length >= 3 && parts[0] === 'docs';

    if (!isDocsArticleRoute) {
      setAllHeadings([]);
      setVisibleSections([]);
    }
  }, [pathname, setAllHeadings, setVisibleSections]);

  const hasHeadings = headings.length > 0;

  const tocList = useMemo(
    () => (
      <ul className="space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={() => {
                setVisibleSections([heading.id]);
                setIsOpen(false);
              }}
              className={cn(
                'block rounded-2xl border px-3 py-2 text-sm transition-colors',
                heading.level === 3 ? 'ml-3' : 'ml-0',
                activeId === heading.id
                  ? 'border-primary/35 bg-primary/10 text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-panel hover:text-foreground'
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    ),
    [activeId, headings, setVisibleSections]
  );

  if (mode === 'mobile-trigger') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-panel-elevated/90 px-3 py-2 text-sm font-medium text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] xl:hidden"
        >
          <AlignLeft className="h-4 w-4" />
          On this page
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {isOpen ? (
          <button
            className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm xl:hidden"
            onClick={() => setIsOpen(false)}
          />
        ) : null}

        <aside
          data-lenis-prevent
          aria-hidden={!isOpen}
          className={cn(
            'fixed inset-y-0 right-0 z-[60] w-[88%] max-w-sm overflow-y-auto border-l border-border bg-background px-5 py-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] transition-transform xl:hidden',
            isOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
            <p className="text-sm font-semibold tracking-[0.16em] text-foreground">On this page</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-border bg-panel p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close table of contents"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {hasHeadings ? (
            tocList
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              This page does not have a heading map yet.
            </p>
          )}
        </aside>
      </>
    );
  }

  return (
    <div className="rounded-[1.6rem] border border-border bg-panel-elevated/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        On this page
      </p>
      {hasHeadings ? (
        tocList
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          This page does not have a heading map yet.
        </p>
      )}
    </div>
  );
}
