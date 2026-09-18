'use client';

import { useTheme, type ThemeMode } from 'vista/theme';

const OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mounted, theme, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-panel-elevated/90 p-1">
      {OPTIONS.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`inline-flex items-center justify-center rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
            } ${compact ? 'px-2.5' : ''}`}
            aria-pressed={isActive}
            title={mounted ? option.label : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
