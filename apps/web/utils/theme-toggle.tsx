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
        'inline-flex items-center gap-0.5 rounded-full border border-foreground/10 bg-background/85 p-0.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/72',
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
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors',
              isActive
                ? 'bg-foreground text-background shadow-sm'
                : 'text-foreground/65 hover:bg-foreground/8 hover:text-foreground',
              compact && 'w-7 px-0'
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
