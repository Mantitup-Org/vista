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
    // Prevent stale mobile drawer overlay when navigating between docs routes.
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
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={() => {
                setVisibleSections([heading.id]);
                setIsOpen(false);
              }}
              className={cn(
                'block border-l px-3 py-1 text-sm transition-colors',
                heading.level === 3 ? 'ml-3' : 'ml-0',
                activeId === heading.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-zinc-500 hover:text-zinc-200'
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    ),
    [activeId, headings]
  );

  if (mode === 'mobile-trigger') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-sm text-zinc-200 xl:hidden"
        >
          <AlignLeft className="h-4 w-4" />
          On this page
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        </button>

        {isOpen ? <button className="fixed inset-0 z-50 bg-black/70 xl:hidden" onClick={() => setIsOpen(false)} /> : null}

        <aside
          className={cn(
            'fixed inset-y-0 right-0 z-[60] w-[86%] max-w-xs border-l border-zinc-800 bg-black p-4 transition-transform xl:hidden',
            isOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3">
            <p className="text-sm font-semibold text-zinc-100">On this page</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              aria-label="Close table of contents"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {hasHeadings ? tocList : <p className="text-sm text-zinc-500">No headings found for this page yet.</p>}
        </aside>
      </>
    );
  }

  return (
    <div id="docs-on-this-page" className="rounded-xl border border-zinc-900/70 bg-zinc-950/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">On this page</p>
      {hasHeadings ? tocList : <p className="text-sm text-zinc-500">No headings found for this page yet.</p>}
    </div>
  );
}
