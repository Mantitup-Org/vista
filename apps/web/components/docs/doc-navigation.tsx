'use client';

import Link from 'vista/link';
import { usePathname } from 'vista/navigation';
import type { DocsNavigationGroup } from '../../lib/docs';
import { cn } from '../../lib/utils';

interface DocNavigationProps {
  navigation: DocsNavigationGroup[];
  onNavigate?: () => void;
  className?: string;
}

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  return pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export default function DocNavigation({
  navigation,
  onNavigate,
  className,
}: DocNavigationProps) {
  const pathname = normalizePath(usePathname() || '/');

  return (
    <nav className={cn('space-y-6', className)}>
      {navigation.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {group.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{group.description}</p>
          </div>

          <ul className="space-y-1.5">
            {group.docs.map((doc) => {
              const isActive = pathname === normalizePath(doc.href);
              return (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    onClick={onNavigate}
                    className={cn(
                      'block rounded-2xl border px-3 py-3 transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-foreground shadow-[0_14px_30px_rgba(255,76,48,0.10)]'
                        : 'border-transparent bg-transparent text-muted-foreground hover:border-border/80 hover:bg-panel hover:text-foreground'
                    )}
                  >
                    <span className="block text-sm font-medium">{doc.title}</span>
                    <span className="mt-1 block text-xs leading-5">{doc.summary}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
