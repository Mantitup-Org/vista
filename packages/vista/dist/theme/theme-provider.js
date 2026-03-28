'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTheme = applyTheme;
exports.ThemeProvider = ThemeProvider;
exports.useTheme = useTheme;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const THEME_STORAGE_KEY = 'vista-theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const MEDIA_QUERY = '(prefers-color-scheme: dark)';
const ThemeContext = (0, react_1.createContext)(null);
function sanitizeTheme(value, fallback) {
    if (value === 'system' || value === 'light' || value === 'dark') {
        return value;
    }
    return fallback;
}
function getSystemTheme() {
    if (typeof window === 'undefined') {
        return 'dark';
    }
    return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}
function resolveTheme(theme) {
    return theme === 'system' ? getSystemTheme() : theme;
}
function applyTheme(theme) {
    if (typeof document === 'undefined') {
        return;
    }
    const resolvedTheme = resolveTheme(theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.dataset.theme = theme;
    root.style.colorScheme = resolvedTheme;
}
function ThemeProvider({ children, defaultTheme = 'system', }) {
    const [theme, setThemeState] = (0, react_1.useState)(defaultTheme);
    const [mounted, setMounted] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const nextTheme = sanitizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
        setThemeState(nextTheme);
        applyTheme(nextTheme);
        setMounted(true);
    }, [defaultTheme]);
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        applyTheme(theme);
    }, [mounted, theme]);
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        const media = window.matchMedia(MEDIA_QUERY);
        const handleMediaChange = () => {
            const currentTheme = sanitizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
            if (currentTheme === 'system') {
                applyTheme('system');
            }
        };
        const handleStorage = (event) => {
            if (event.key !== THEME_STORAGE_KEY)
                return;
            const nextTheme = sanitizeTheme(event.newValue, defaultTheme);
            setThemeState(nextTheme);
            applyTheme(nextTheme);
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', handleMediaChange);
        }
        else {
            media.addListener(handleMediaChange);
        }
        window.addEventListener('storage', handleStorage);
        return () => {
            if (typeof media.removeEventListener === 'function') {
                media.removeEventListener('change', handleMediaChange);
            }
            else {
                media.removeListener(handleMediaChange);
            }
            window.removeEventListener('storage', handleStorage);
        };
    }, [defaultTheme, mounted]);
    const setTheme = (0, react_1.useCallback)((nextTheme) => {
        setThemeState(nextTheme);
    }, []);
    const cycleTheme = (0, react_1.useCallback)(() => {
        setThemeState((currentTheme) => {
            const index = THEME_ORDER.indexOf(currentTheme);
            return THEME_ORDER[(index + 1) % THEME_ORDER.length];
        });
    }, []);
    const value = (0, react_1.useMemo)(() => ({
        theme,
        resolvedTheme: resolveTheme(theme),
        setTheme,
        cycleTheme,
        mounted,
    }), [cycleTheme, mounted, setTheme, theme]);
    return (0, jsx_runtime_1.jsx)(ThemeContext.Provider, { value: value, children: children });
}
function useTheme() {
    const context = (0, react_1.useContext)(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider.');
    }
    return context;
}
