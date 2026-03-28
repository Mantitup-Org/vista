'use client';

import { Laptop2, MoonStar, SunMedium } from 'lucide-react';
import { useTheme, type ThemeMode } from 'vista/theme';
import { cn } from '../lib/utils';

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  icon: typeof Laptop2;
}> = [
  { value: 'system', label: 'System', icon: Laptop2 },
  { value: 'light', label: 'Light', icon: SunMedium },
  { value: 'dark', label: 'Dark', icon: MoonStar },
];

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { mounted, theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/80 bg-panel-elevated/90 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur',
        className
      )}
      aria-label="Theme switcher"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
              compact && 'px-2.5'
            )}
            aria-pressed={isActive}
            title={mounted ? option.label : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
