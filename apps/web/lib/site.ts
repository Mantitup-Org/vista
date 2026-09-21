import { allDocs } from 'content-collections';
import { getDocPath } from './docs';

export const siteName = 'Vista';
export const siteTitle = 'Vista | React, fullstack, auth, and AI';
export const siteDescription =
  'Vista is a React framework: pages and Server Components for UI, route.ts and typed APIs for fullstack, vista g auth for sessions, and vista g agent for chat and RAG.';
export const siteUrl = 'https://vistajs.pages.dev';
export const siteLocale = 'en_US';
export const siteOgImage = '/vista.svg';
export const siteKeywords = [
  'Vista',
  'React framework',
  'Server Components',
  'SSR',
  'RSC',
  'typed APIs',
  'authentication',
  'AI agents',
  'RAG',
  'Flashpack',
  'full-stack React',
];

export function absoluteUrl(pathname: string = '/'): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, siteUrl).toString();
}

export function getSiteMapEntries(): Array<{ url: string; lastModified?: string }> {
  const staticEntries = [
    { url: absoluteUrl('/'), lastModified: '2026-03-28' },
    { url: absoluteUrl('/docs'), lastModified: '2026-03-28' },
  ];

  const docEntries = allDocs.map((doc) => ({
    url: absoluteUrl(getDocPath(doc)),
    lastModified: doc.updatedAt,
  }));

  return [...staticEntries, ...docEntries];
}
