import type { ReactNode } from 'react';
import { getDocsNavigation } from '../../lib/docs';
import DocNavigation from './doc-navigation';
import MobileNavigation from './mobile-nav';
import TableOfContents from './table-of-contents';

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  const navigation = getDocsNavigation();

  return (
    <main className="min-h-screen bg-black text-zinc-100 selection:bg-primary/20 selection:text-primary pt-20 pb-20">
      <div className="mx-auto flex w-full max-w-[1400px] justify-end gap-2 px-4 sm:px-6 lg:hidden">
        <TableOfContents mode="mobile-trigger" />
        <MobileNavigation navigation={navigation} />
      </div>

      <div className="mx-auto mt-4 w-full max-w-[1400px] min-h-[calc(100vh-9rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_240px]">
          <aside className="hidden self-start border-r border-zinc-900/70 lg:sticky lg:top-20 lg:block">
            <div className="px-4 py-6 pb-16">
              <DocNavigation navigation={navigation} />
            </div>
          </aside>

          <section className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">{children}</section>

          <aside className="hidden border-l border-zinc-900/70 px-4 py-6 xl:block">
            <div className="sticky top-24">
              <TableOfContents mode="desktop" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
