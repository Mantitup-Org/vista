/**
 * React-server entry for `vista/theme`.
 *
 * ThemeScript is a real Server Component (inline blocking script).
 * ThemeProvider/useTheme are Client Components; the compile hook turns
 * `theme-provider` into a Flight client proxy under `--conditions react-server`.
 */
export { ThemeScript } from './theme-script';
export { ThemeProvider, applyTheme, useTheme } from './theme-provider';
export type { ResolvedTheme, ThemeMode } from './theme-provider';
