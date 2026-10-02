'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, ChevronDown, X } from 'lucide-react';
import { usePathname } from 'vista/navigation';
import { cn } from '../../lib/utils';
import { useTableOfContents } from '../../ctx/use-table-of-contents';

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

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

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
      <ul className="space-y-0.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={() => {
                setVisibleSections([heading.id]);
                setIsOpen(false);
              }}
              className={cn(
                'block border-l py-1 text-[13px] leading-snug transition-colors',
                heading.level === 3 ? 'pl-5' : 'pl-3',
                activeId === heading.id
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-foreground/45 hover:text-foreground'
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
    if (!hasHeadings) return null;

    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-foreground/12 bg-background px-2.5 py-1.5 text-[13px] text-foreground/70 xl:hidden"
        >
          <AlignLeft className="h-3.5 w-3.5" />
          On this page
          <ChevronDown className="h-3.5 w-3.5 text-foreground/40" />
        </button>

        {isOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[2px] xl:hidden"
            onClick={() => setIsOpen(false)}
            aria-label="Close on this page"
          />
        ) : null}

        <aside
          className={cn(
            'fixed inset-y-0 right-0 z-[60] w-[min(86vw,18rem)] border-l border-foreground/10 bg-background p-5 transition-transform xl:hidden',
            isOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">On this page</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground"
              aria-label="Close table of contents"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {tocList}
        </aside>
      </>
    );
  }

  if (!hasHeadings) return null;

  return (
    <div id="docs-on-this-page">
      <p className="mb-3 text-[13px] font-semibold tracking-tight text-foreground">On this page</p>
      {tocList}
    </div>
  );
}
