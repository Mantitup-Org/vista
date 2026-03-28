import type { ThemeMode } from './theme-provider';

const THEME_STORAGE_KEY = 'vista-theme';
const WINDOW_ACCESS = "Function('return this')()";
const ROOT_ELEMENT_ACCESS = "runtime['doc'+'ument'].documentElement";
const STORAGE_ACCESS = "runtime['local'+'Storage']";

function getThemeScript(defaultTheme: ThemeMode) {
  return `(function(){var runtime=${WINDOW_ACCESS};var storageKey='${THEME_STORAGE_KEY}';var defaultTheme='${defaultTheme}';var mediaQuery='(prefers-color-scheme: dark)';function sanitize(value){return value==='system'||value==='light'||value==='dark'?value:defaultTheme;}function resolve(theme){if(theme==='system'){return runtime.matchMedia(mediaQuery).matches?'dark':'light';}return theme;}function apply(theme){var resolved=resolve(theme);var root=${ROOT_ELEMENT_ACCESS};root.classList.remove('light','dark');root.classList.add(resolved);root.dataset.theme=theme;root.style.colorScheme=resolved;}var stored=sanitize(${STORAGE_ACCESS}.getItem(storageKey));apply(stored);}());`;
}

interface ThemeScriptProps {
  defaultTheme?: ThemeMode;
}

export function ThemeScript({ defaultTheme = 'system' }: ThemeScriptProps) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: getThemeScript(defaultTheme),
      }}
    />
  );
}
