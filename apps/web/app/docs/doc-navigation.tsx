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
          <section key={group.id} className="rounded-xl border border-zinc-900/80 bg-zinc-950/40">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{group.title}</p>
              {isGroupOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              )}
            </button>

            {isGroupOpen ? (
              <ul className="space-y-2 border-t border-zinc-900/80 p-2">
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
                            : 'border-zinc-900/70 bg-zinc-950/40 hover:border-zinc-800'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={doc.href}
                            onClick={onNavigate}
                            className={cn(
                              'text-sm font-medium transition-colors',
                              isActive ? 'text-primary' : 'text-zinc-200 hover:text-zinc-100'
                            )}
                          >
                            {doc.title}
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleDoc(doc.normalizedHref)}
                            className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                            aria-label={`Toggle ${doc.title} summary`}
                          >
                            {isExpanded ? 'Hide' : 'Info'}
                          </button>
                        </div>
                        {isExpanded ? (
                          <p
                            className={cn(
                              'mt-2 text-xs leading-relaxed',
                              isActive ? 'text-primary/75' : 'text-zinc-500'
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
