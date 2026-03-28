'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navigation.map((group) => [group.id, true]))
  );
  const [expandedDocHref, setExpandedDocHref] = useState<string | null>(null);

  const docsByGroup = useMemo(
    () =>
      navigation.map((group) => ({
        ...group,
        docs: group.docs.map((doc) => ({
          ...doc,
          normalizedHref: normalizePath(doc.href),
        })),
      })),
    [navigation]
  );

  useEffect(() => {
    setExpandedDocHref(pathname);

    const activeGroup = docsByGroup.find((group) =>
      group.docs.some((doc) => doc.normalizedHref === pathname)
    );

    if (!activeGroup) return;
    setOpenGroups((current) => ({ ...current, [activeGroup.id]: true }));
  }, [docsByGroup, pathname]);

  function toggleGroup(groupId: string): void {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  function toggleDoc(href: string): void {
    setExpandedDocHref((current) => (current === href ? null : href));
  }

  return (
    <nav className={cn('space-y-4', className)}>
      {docsByGroup.map((group) => {
        const isGroupOpen = openGroups[group.id] ?? true;
        return (
          <section
            key={group.id}
            className="rounded-xl border border-foreground/12 bg-foreground/[0.025] shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:bg-white/[0.03]"
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
                {group.title}
              </p>
              {isGroupOpen ? (
                <ChevronDown className="h-4 w-4 text-foreground/45" />
              ) : (
                <ChevronRight className="h-4 w-4 text-foreground/45" />
              )}
            </button>

            {isGroupOpen ? (
              <ul className="space-y-2 border-t border-foreground/10 p-2">
                {group.docs.map((doc) => {
                  const isActive = pathname === doc.normalizedHref;
                  const isExpanded = expandedDocHref === doc.normalizedHref;
                  return (
                    <li key={doc.href} className="rounded-lg border border-transparent">
                      <div
                        className={cn(
                          'rounded-lg border px-2 py-2 transition-colors',
                          isActive
                            ? 'border-primary/45 bg-primary/10'
                            : 'border-foreground/10 bg-background/60 hover:border-foreground/20 hover:bg-foreground/[0.035] dark:bg-white/[0.02]'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={doc.href}
                            onClick={onNavigate}
                            className={cn(
                              'text-sm font-medium transition-colors',
                              isActive ? 'text-primary' : 'text-foreground/88 hover:text-foreground'
                            )}
                          >
                            {doc.title}
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleDoc(doc.normalizedHref)}
                            className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/42 hover:bg-foreground/[0.06] hover:text-foreground/75"
                            aria-label={`Toggle ${doc.title} summary`}
                          >
                            {isExpanded ? 'Hide' : 'Info'}
                          </button>
                        </div>
                        {isExpanded ? (
                          <p
                            className={cn(
                              'mt-2 text-xs leading-relaxed',
                              isActive ? 'text-primary/80' : 'text-foreground/56'
                            )}
                          >
                            {doc.summary}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}
