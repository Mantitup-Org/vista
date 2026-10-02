'use client';

import { useEffect } from 'react';
import { useTableOfContents } from '../ctx/use-table-of-contents';

interface ActiveSectionObserverProps {
  headings: Array<{ id: string; level: number; text: string }>;
}

export function ActiveSectionObserver({ headings }: ActiveSectionObserverProps) {
  const setVisibleSections = useTableOfContents((state) => state.setVisibleSections);
  const setAllHeadings = useTableOfContents((state) => state.setAllHeadings);

  useEffect(() => {
    setAllHeadings(headings.filter(({ level }) => level === 2 || level === 3));
  }, [headings, setAllHeadings]);

  useEffect(() => {
    const observed = document.querySelectorAll<HTMLElement>('[data-doc-heading]');
    if (observed.length === 0) {
      setVisibleSections([]);
      return;
    }

    const callback: IntersectionObserverCallback = (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => (entry.target as HTMLElement).id)
        .filter(Boolean);

      if (visible.length > 0) {
        setVisibleSections(visible);
      }
    };

    const observer = new IntersectionObserver(callback, {
      rootMargin: '-100px 0px -66%',
      threshold: 1,
    });

    observed.forEach((element) => observer.observe(element));

    return () => {
      observed.forEach((element) => observer.unobserve(element));
      observer.disconnect();
    };
  }, [headings, setVisibleSections]);

  return null;
}
