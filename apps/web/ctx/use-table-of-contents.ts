'use client';

import { useSyncExternalStore } from 'react';

interface Heading {
  id: string;
  level: number;
  text: string;
}

interface TableOfContentsState {
  allHeadings: Heading[];
  visibleSections: string[];
  setAllHeadings: (headings: Heading[]) => void;
  setVisibleSections: (visibleSections: string[]) => void;
}

type StoreSnapshot = Omit<TableOfContentsState, 'setAllHeadings' | 'setVisibleSections'>;

const listeners = new Set<() => void>();

let snapshot: StoreSnapshot = {
  allHeadings: [],
  visibleSections: [],
};

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreSnapshot {
  return snapshot;
}

function setAllHeadings(headings: Heading[]): void {
  if (
    snapshot.allHeadings.length === headings.length &&
    snapshot.allHeadings.every(
      (heading, index) =>
        heading.id === headings[index]?.id &&
        heading.level === headings[index]?.level &&
        heading.text === headings[index]?.text
    )
  ) {
    return;
  }
  snapshot = {
    ...snapshot,
    allHeadings: headings,
  };
  notify();
}

function setVisibleSections(visibleSections: string[]): void {
  if (
    snapshot.visibleSections.length === visibleSections.length &&
    snapshot.visibleSections.every((id, index) => id === visibleSections[index])
  ) {
    return;
  }
  snapshot = {
    ...snapshot,
    visibleSections,
  };
  notify();
}

export function useTableOfContents<T>(selector: (state: TableOfContentsState) => T): T {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector({
    ...state,
    setAllHeadings,
    setVisibleSections,
  });
}
