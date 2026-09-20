/**
 * React-server entry for `vista/theme`.
 *
 * ThemeScript is a real Server Component (inline blocking script).
 * ThemeProvider/useTheme/ThemeToggle are Client Components; the compile hook
 * turns those modules into Flight client proxies under `--conditions react-server`.
 */
export { ThemeScript } from './theme-script';
export { ThemeProvider, applyTheme, useTheme } from './theme-provider';
export { ThemeToggle } from './theme-toggle';
export type { ResolvedTheme, ThemeMode } from './theme-provider';
export type { ThemeToggleProps } from './theme-toggle';
