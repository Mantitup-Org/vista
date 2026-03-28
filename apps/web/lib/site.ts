import { allDocs } from 'content-collections';
import { getDocPath } from './docs';

export const siteName = 'Vista';
export const siteTitle = 'Vista | The React Framework for Visionaries';
export const siteDescription =
  'Vista is the React framework for visionaries, built for fast iteration, server rendering, typed APIs, and real production control.';
export const siteUrl = 'https://vista.xyz';
export const siteLocale = 'en_US';
export const siteOgImage = '/vista.svg';
export const siteKeywords = [
  'Vista',
  'React framework',
  'Server Components',
  'SSR',
  'RSC',
  'typed APIs',
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
