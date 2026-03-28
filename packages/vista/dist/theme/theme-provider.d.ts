import { type ReactNode } from 'react';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
interface ThemeContextValue {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemeMode) => void;
    cycleTheme: () => void;
    mounted: boolean;
}
export declare function applyTheme(theme: ThemeMode): void;
interface ThemeProviderProps {
    children: ReactNode;
    defaultTheme?: ThemeMode;
}
export declare function ThemeProvider({ children, defaultTheme, }: ThemeProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useTheme(): ThemeContextValue;
export {};
