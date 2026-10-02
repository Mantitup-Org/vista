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

export default function DocNavigation({ navigation, onNavigate, className }: DocNavigationProps) {
  const pathname = normalizePath(usePathname() || '/');

  return (
    <nav className={cn('space-y-7', className)} aria-label="Documentation">
      {navigation.map((group) => (
        <div key={group.id}>
          <p className="mb-2 text-[13px] font-semibold tracking-tight text-foreground">
            {group.title}
          </p>
          <ul className="space-y-0.5 border-l border-foreground/10">
            {group.docs.map((doc) => {
              const href = normalizePath(doc.href);
              const isActive = pathname === href;
              return (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    onClick={onNavigate}
                    className={cn(
                      '-ml-px block border-l py-1.5 pl-3 text-[13px] leading-snug transition-colors',
                      isActive
                        ? 'border-foreground font-medium text-foreground'
                        : 'border-transparent text-foreground/55 hover:border-foreground/25 hover:text-foreground'
                    )}
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
