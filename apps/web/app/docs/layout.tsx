import type { ReactNode } from 'react';
import { getDocsNavigation } from '../../lib/docs';
import DocNavigation from '@/components/docs/doc-navigation';
import MobileNavigation from '@/components/docs/mobile-nav';
import TableOfContents from '@/components/docs/table-of-contents';

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  const navigation = getDocsNavigation();

  return (
    <main className="min-h-screen pt-24 pb-16 selection:bg-primary/15 selection:text-primary">
      <div className="mx-auto w-full max-w-[1460px] px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
          <MobileNavigation navigation={navigation} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_250px]">
          <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
            <div className="rounded-[1.8rem] border border-border bg-panel-elevated/80 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <DocNavigation navigation={navigation} />
            </div>
          </aside>

          <section className="min-w-0">{children}</section>

          <aside className="hidden xl:block">
            <div className="sticky top-24">
              <TableOfContents mode="desktop" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
