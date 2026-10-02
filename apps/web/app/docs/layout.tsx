import type { ReactNode } from 'react';
import type { Metadata } from 'vista';
import { getDocsNavigation } from '../../lib/docs';
import DocNavigation from './doc-navigation';
import MobileNavigation from './mobile-nav';
import TableOfContents from './table-of-contents';

export const metadata: Metadata = {
  title: {
    default: 'Documentation',
    template: '%s | Vista Docs',
  },
};

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  const navigation = getDocsNavigation();

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-foreground/10">
      <div className="sticky top-16 z-30 border-b border-foreground/10 bg-background/90 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <MobileNavigation navigation={navigation} />
          <TableOfContents mode="mobile-trigger" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px]">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
          <aside className="hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-r border-foreground/10 lg:sticky lg:top-16 lg:block">
            <div className="px-4 py-8 pb-24 sm:px-5">
              <DocNavigation navigation={navigation} />
            </div>
          </aside>

          <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</section>

          <aside className="hidden max-h-[calc(100dvh-4rem)] overflow-y-auto xl:sticky xl:top-16 xl:block">
            <div className="px-4 py-8 pb-24">
              <TableOfContents mode="desktop" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
