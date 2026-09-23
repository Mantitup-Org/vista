/**
 * Vista Google Font Loader
 *
 * Usage (Next.js-compatible):
 *
 *   import { Inter, Roboto_Mono } from '@vistagenic/vista/font/google';
 *
 *   const inter = Inter({ subsets: ['latin'], weight: ['400', '700'] });
 *   const mono  = Roboto_Mono({ variable: '--font-mono' });
 *
 *   // In root layout:
 *   <html className={`${inter.className} ${mono.variable}`}>
 *
 *   // Or inline:
 *   <div style={inter.style}>Hello</div>
 */

import type { GoogleFontOptions, FontResult, FontWeight, FontRegistryEntry } from './types';
import { registerFont } from './registry';

// ─── Helpers ───────────────────────────────────────────────────────────────

const GOOGLE_CSS2 = 'https://fonts.googleapis.com/css2';

/**
 * Deterministic, short hash for generating unique class names.
 */
function hashName(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = (h * 0x01000193) | 0;
  }
  return Math.abs(h).toString(36);
}

function toClassName(family: string): string {
  return `__font_${hashName(family)}`;
}

function toVariableName(family: string): string {
  return `--font-${family.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Normalise weight to string for the Google Fonts URL.
 */
function normaliseWeight(w: FontWeight): string {
  if (w === 'variable') return 'variable';
  return String(w);
}

/**
 * Build Google Fonts CSS2 API URL.
 *
 * Examples:
 *   https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap&subset=latin
 *   https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,400&display=swap
 */
function buildGoogleUrl(family: string, opts: GoogleFontOptions): string {
  const weights: string[] = opts.weight
    ? (Array.isArray(opts.weight) ? opts.weight : [opts.weight]).map(normaliseWeight)
    : ['400'];
  const styles: string[] = opts.style
    ? Array.isArray(opts.style)
      ? opts.style
      : [opts.style]
    : ['normal'];
  const display = opts.display || 'swap';

  const hasItalic = styles.includes('italic');
  const hasNormal = styles.includes('normal');

  let familyParam: string;

  if (weights.includes('variable')) {
    // Variable font — use full weight range
    if (hasItalic && hasNormal) {
      familyParam = `${family}:ital,wght@0,100..900;1,100..900`;
    } else if (hasItalic) {
      familyParam = `${family}:ital,wght@1,100..900`;
    } else {
      familyParam = `${family}:wght@100..900`;
    }
    // Handle custom axes
    if (opts.axes) {
      const axisEntries = Object.entries(opts.axes).filter(
        ([axis]) => axis !== 'wght' && axis !== 'ital'
      );
      if (axisEntries.length > 0) {
        // Build sorted axis list: ital (if present) + custom axes (alphabetical) + wght
        const customAxes = axisEntries.map(([axis]) => axis).sort();
        const allAxes = hasItalic ? ['ital', ...customAxes, 'wght'] : [...customAxes, 'wght'];
        const axisStr = allAxes.join(',');

        // Rebuild tuples with axis values in the correct order
        const newTuples: string[] = [];
        const weightRange = '100..900';
        const axisRanges = axisEntries.map(([axis, range]) => {
          const rangeStr = Array.isArray(range) ? `${range[0]}..${range[1]}` : String(range);
          return [axis, rangeStr] as const;
        });

        const buildTuple = (italicVal: string | null): string => {
          const parts: string[] = [];
          for (const axis of allAxes) {
            if (axis === 'ital') {
              parts.push(italicVal ?? '0');
            } else if (axis === 'wght') {
              parts.push(weightRange);
            } else {
              const found = axisRanges.find(([a]) => a === axis);
              parts.push(found ? found[1] : weightRange);
            }
          }
          return parts.join(',');
        };

        if (hasItalic && hasNormal) {
          newTuples.push(buildTuple('0'));
          newTuples.push(buildTuple('1'));
        } else if (hasItalic) {
          newTuples.push(buildTuple('1'));
        } else {
          newTuples.push(buildTuple(null));
        }

        familyParam = `${family}:${axisStr}@${newTuples.join(';')}`;
      }
    }
  } else {
    // Static weights
    const tuples: string[] = [];
    for (const w of weights) {
      if (hasNormal) tuples.push(hasItalic ? `0,${w}` : w);
      if (hasItalic) tuples.push(`1,${w}`);
    }
    // Deduplicate and sort
    const uniqueTuples = [...new Set(tuples)].sort();
    if (hasItalic) {
      familyParam = `${family}:ital,wght@${uniqueTuples.join(';')}`;
    } else {
      familyParam = `${family}:wght@${uniqueTuples.join(';')}`;
    }
  }

  const params = new URLSearchParams();
  params.set('family', familyParam);
  params.set('display', display);
  if (opts.subsets && opts.subsets.length > 0) {
    // Google ignores an explicit "subset" query param in CSS2 API — subsets are
    // selected via unicode-range in the returned CSS.  We append it anyway
    // because the text parameter triggers glyph subsetting when present.
    // For most use cases, omitting is fine and we rely on `unicode-range`.
  }

  return `${GOOGLE_CSS2}?${params.toString()}`;
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Core factory: creates a configured Google Font and registers it in the
 * global font registry for SSR head injection.
 */
export function createGoogleFont(
  family: string,
  defaultFallback: string[],
  options: GoogleFontOptions = {}
): FontResult {
  const fallback = options.fallback || defaultFallback;
  const className = toClassName(family);
  const variableName = options.variable || toVariableName(family);
  const fontFamilyValue = `'${family}', ${fallback.join(', ')}`;
  const googleUrl = buildGoogleUrl(family, options);

  // Generate CSS for the utility class + CSS variable
  const injectCSS = [
    `.${className} { font-family: ${fontFamilyValue}; }`,
    `:root { ${variableName}: ${fontFamilyValue}; }`,
  ].join('\n');

  const entry: FontRegistryEntry = {
    kind: 'google',
    family,
    className,
    variableName,
    googleUrl,
    injectCSS,
  };

  registerFont(entry);

  return {
    className,
    style: { fontFamily: fontFamilyValue },
    variable: variableName,
  };
}

// ─── Pre-configured Google Fonts (Next.js parity) ──────────────────────────
// Each export is a function that accepts options and returns FontResult, just
// like next/font/google.

// Sans-serif fonts
export const Inter = (opts?: GoogleFontOptions) =>
  createGoogleFont('Inter', ['system-ui', 'sans-serif'], opts);

export const Roboto = (opts?: GoogleFontOptions) =>
  createGoogleFont('Roboto', ['system-ui', 'sans-serif'], opts);

export const Open_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('Open Sans', ['system-ui', 'sans-serif'], opts);

export const Lato = (opts?: GoogleFontOptions) =>
  createGoogleFont('Lato', ['system-ui', 'sans-serif'], opts);

export const Montserrat = (opts?: GoogleFontOptions) =>
  createGoogleFont('Montserrat', ['system-ui', 'sans-serif'], opts);

export const Poppins = (opts?: GoogleFontOptions) =>
  createGoogleFont('Poppins', ['system-ui', 'sans-serif'], opts);

export const Nunito = (opts?: GoogleFontOptions) =>
  createGoogleFont('Nunito', ['system-ui', 'sans-serif'], opts);

export const Nunito_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('Nunito Sans', ['system-ui', 'sans-serif'], opts);

export const Raleway = (opts?: GoogleFontOptions) =>
  createGoogleFont('Raleway', ['system-ui', 'sans-serif'], opts);

export const Ubuntu = (opts?: GoogleFontOptions) =>
  createGoogleFont('Ubuntu', ['system-ui', 'sans-serif'], opts);

export const Oswald = (opts?: GoogleFontOptions) =>
  createGoogleFont('Oswald', ['system-ui', 'sans-serif'], opts);

export const Outfit = (opts?: GoogleFontOptions) =>
  createGoogleFont('Outfit', ['system-ui', 'sans-serif'], opts);

export const Manrope = (opts?: GoogleFontOptions) =>
  createGoogleFont('Manrope', ['system-ui', 'sans-serif'], opts);

export const Space_Grotesk = (opts?: GoogleFontOptions) =>
  createGoogleFont('Space Grotesk', ['system-ui', 'sans-serif'], opts);

export const DM_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('DM Sans', ['system-ui', 'sans-serif'], opts);

export const Work_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('Work Sans', ['system-ui', 'sans-serif'], opts);

export const Quicksand = (opts?: GoogleFontOptions) =>
  createGoogleFont('Quicksand', ['system-ui', 'sans-serif'], opts);

export const Barlow = (opts?: GoogleFontOptions) =>
  createGoogleFont('Barlow', ['system-ui', 'sans-serif'], opts);

export const Figtree = (opts?: GoogleFontOptions) =>
  createGoogleFont('Figtree', ['system-ui', 'sans-serif'], opts);

export const Geist = (opts?: GoogleFontOptions) =>
  createGoogleFont('Geist', ['system-ui', 'sans-serif'], opts);

export const Plus_Jakarta_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('Plus Jakarta Sans', ['system-ui', 'sans-serif'], opts);

export const Sora = (opts?: GoogleFontOptions) =>
  createGoogleFont('Sora', ['system-ui', 'sans-serif'], opts);

export const Lexend = (opts?: GoogleFontOptions) =>
  createGoogleFont('Lexend', ['system-ui', 'sans-serif'], opts);

export const Cabin = (opts?: GoogleFontOptions) =>
  createGoogleFont('Cabin', ['system-ui', 'sans-serif'], opts);

export const Karla = (opts?: GoogleFontOptions) =>
  createGoogleFont('Karla', ['system-ui', 'sans-serif'], opts);

export const Noto_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('Noto Sans', ['system-ui', 'sans-serif'], opts);

export const Rubik = (opts?: GoogleFontOptions) =>
  createGoogleFont('Rubik', ['system-ui', 'sans-serif'], opts);

export const Mulish = (opts?: GoogleFontOptions) =>
  createGoogleFont('Mulish', ['system-ui', 'sans-serif'], opts);

export const PT_Sans = (opts?: GoogleFontOptions) =>
  createGoogleFont('PT Sans', ['system-ui', 'sans-serif'], opts);

// Serif fonts
export const Playfair_Display = (opts?: GoogleFontOptions) =>
  createGoogleFont('Playfair Display', ['Georgia', 'serif'], opts);

export const Merriweather = (opts?: GoogleFontOptions) =>
  createGoogleFont('Merriweather', ['Georgia', 'serif'], opts);

export const Lora = (opts?: GoogleFontOptions) =>
  createGoogleFont('Lora', ['Georgia', 'serif'], opts);

export const PT_Serif = (opts?: GoogleFontOptions) =>
  createGoogleFont('PT Serif', ['Georgia', 'serif'], opts);

export const Noto_Serif = (opts?: GoogleFontOptions) =>
  createGoogleFont('Noto Serif', ['Georgia', 'serif'], opts);

export const Libre_Baskerville = (opts?: GoogleFontOptions) =>
  createGoogleFont('Libre Baskerville', ['Georgia', 'serif'], opts);

export const DM_Serif_Display = (opts?: GoogleFontOptions) =>
  createGoogleFont('DM Serif Display', ['Georgia', 'serif'], opts);

export const Bitter = (opts?: GoogleFontOptions) =>
  createGoogleFont('Bitter', ['Georgia', 'serif'], opts);

export const Crimson_Text = (opts?: GoogleFontOptions) =>
  createGoogleFont('Crimson Text', ['Georgia', 'serif'], opts);

export const Cormorant_Garamond = (opts?: GoogleFontOptions) =>
  createGoogleFont('Cormorant Garamond', ['Georgia', 'serif'], opts);

// Monospace fonts
export const Roboto_Mono = (opts?: GoogleFontOptions) =>
  createGoogleFont('Roboto Mono', ['ui-monospace', 'monospace'], opts);

export const Source_Code_Pro = (opts?: GoogleFontOptions) =>
  createGoogleFont('Source Code Pro', ['ui-monospace', 'monospace'], opts);

export const JetBrains_Mono = (opts?: GoogleFontOptions) =>
  createGoogleFont('JetBrains Mono', ['ui-monospace', 'monospace'], opts);

export const Fira_Code = (opts?: GoogleFontOptions) =>
  createGoogleFont('Fira Code', ['ui-monospace', 'monospace'], opts);

export const IBM_Plex_Mono = (opts?: GoogleFontOptions) =>
  createGoogleFont('IBM Plex Mono', ['ui-monospace', 'monospace'], opts);

export const Inconsolata = (opts?: GoogleFontOptions) =>
  createGoogleFont('Inconsolata', ['ui-monospace', 'monospace'], opts);

export const Geist_Mono = (opts?: GoogleFontOptions) =>
  createGoogleFont('Geist Mono', ['ui-monospace', 'monospace'], opts);

export const Space_Mono = (opts?: GoogleFontOptions) =>
  createGoogleFont('Space Mono', ['ui-monospace', 'monospace'], opts);

// Display / handwriting fonts
export const Bebas_Neue = (opts?: GoogleFontOptions) =>
  createGoogleFont('Bebas Neue', ['Impact', 'sans-serif'], opts);

export const Abril_Fatface = (opts?: GoogleFontOptions) =>
  createGoogleFont('Abril Fatface', ['Georgia', 'serif'], opts);

export const Pacifico = (opts?: GoogleFontOptions) =>
  createGoogleFont('Pacifico', ['cursive'], opts);

export const Permanent_Marker = (opts?: GoogleFontOptions) =>
  createGoogleFont('Permanent Marker', ['cursive'], opts);

export const Dancing_Script = (opts?: GoogleFontOptions) =>
  createGoogleFont('Dancing Script', ['cursive'], opts);

export const Lobster = (opts?: GoogleFontOptions) => createGoogleFont('Lobster', ['cursive'], opts);

export const Comfortaa = (opts?: GoogleFontOptions) =>
  createGoogleFont('Comfortaa', ['cursive'], opts);

export const Righteous = (opts?: GoogleFontOptions) =>
  createGoogleFont('Righteous', ['Impact', 'sans-serif'], opts);

export const Titan_One = (opts?: GoogleFontOptions) =>
  createGoogleFont('Titan One', ['Impact', 'sans-serif'], opts);

// ─── Dynamic helper ────────────────────────────────────────────────────────

/**
 * Load any Google Font by name (for fonts not pre-configured above).
 *
 *   import { googleFont } from '@vistagenic/vista/font/google';
 *   const font = googleFont('Fira Sans', { weight: ['400', '700'] });
 */
export function googleFont(family: string, opts?: GoogleFontOptions): FontResult {
  return createGoogleFont(family, ['system-ui', 'sans-serif'], opts);
}
