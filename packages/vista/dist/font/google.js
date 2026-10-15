"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pacifico = exports.Abril_Fatface = exports.Bebas_Neue = exports.Space_Mono = exports.Geist_Mono = exports.Inconsolata = exports.IBM_Plex_Mono = exports.Fira_Code = exports.JetBrains_Mono = exports.Source_Code_Pro = exports.Roboto_Mono = exports.Cormorant_Garamond = exports.Crimson_Text = exports.Bitter = exports.DM_Serif_Display = exports.Libre_Baskerville = exports.Noto_Serif = exports.PT_Serif = exports.Lora = exports.Merriweather = exports.Playfair_Display = exports.PT_Sans = exports.Mulish = exports.Rubik = exports.Noto_Sans = exports.Karla = exports.Cabin = exports.Lexend = exports.Sora = exports.Plus_Jakarta_Sans = exports.Geist = exports.Figtree = exports.Barlow = exports.Quicksand = exports.Work_Sans = exports.DM_Sans = exports.Space_Grotesk = exports.Manrope = exports.Outfit = exports.Oswald = exports.Ubuntu = exports.Raleway = exports.Nunito_Sans = exports.Nunito = exports.Poppins = exports.Montserrat = exports.Lato = exports.Open_Sans = exports.Roboto = exports.Inter = void 0;
exports.Titan_One = exports.Righteous = exports.Comfortaa = exports.Lobster = exports.Dancing_Script = exports.Permanent_Marker = void 0;
exports.createGoogleFont = createGoogleFont;
exports.googleFont = googleFont;
const registry_1 = require("./registry");
// ─── Helpers ───────────────────────────────────────────────────────────────
const GOOGLE_CSS2 = 'https://fonts.googleapis.com/css2';
/**
 * Deterministic, short hash for generating unique class names.
 */
function hashName(name) {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i);
        h = (h * 0x01000193) | 0;
    }
    return Math.abs(h).toString(36);
}
function toClassName(family) {
    return `__font_${hashName(family)}`;
}
function toVariableName(family) {
    return `--font-${family.toLowerCase().replace(/\s+/g, '-')}`;
}
/**
 * Normalise weight to string for the Google Fonts URL.
 */
function normaliseWeight(w) {
    if (w === 'variable')
        return 'variable';
    return String(w);
}
/**
 * Build Google Fonts CSS2 API URL.
 *
 * Examples:
 *   https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap&subset=latin
 *   https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,400&display=swap
 */
function buildGoogleUrl(family, opts) {
    const weights = opts.weight
        ? (Array.isArray(opts.weight) ? opts.weight : [opts.weight]).map(normaliseWeight)
        : ['400'];
    const styles = opts.style
        ? Array.isArray(opts.style)
            ? opts.style
            : [opts.style]
        : ['normal'];
    const display = opts.display || 'swap';
    const hasItalic = styles.includes('italic');
    const hasNormal = styles.includes('normal');
    let familyParam;
    if (weights.includes('variable')) {
        // Variable font — use full weight range
        if (hasItalic && hasNormal) {
            familyParam = `${family}:ital,wght@0,100..900;1,100..900`;
        }
        else if (hasItalic) {
            familyParam = `${family}:ital,wght@1,100..900`;
        }
        else {
            familyParam = `${family}:wght@100..900`;
        }
        // Handle custom axes
        if (opts.axes) {
            const axisEntries = Object.entries(opts.axes);
            for (const [axis, range] of axisEntries) {
                if (axis === 'wght' || axis === 'ital')
                    continue; // already handled
                const rangeStr = Array.isArray(range) ? `${range[0]}..${range[1]}` : String(range);
                // Append axis — Google Fonts sorts axes alphabetically
                familyParam = familyParam.replace(/(@.+)$/, (_, tuples) => `,${axis}${tuples}`);
                // This is a simplified approach; a production implementation would
                // fully sort axis names and expand the tuples.  Good enough for now.
                familyParam += `;${rangeStr}`;
            }
        }
    }
    else {
        // Static weights
        const tuples = [];
        for (const w of weights) {
            if (hasItalic) {
                // The CSS2 API requires an explicit `ital` tuple whenever italic is
                // requested; normal-only requests omit it entirely.
                if (hasNormal)
                    tuples.push(`0,${w}`);
                tuples.push(`1,${w}`);
            }
            else {
                tuples.push(w);
            }
        }
        // Deduplicate and sort
        const uniqueTuples = [...new Set(tuples)].sort();
        if (hasItalic) {
            familyParam = `${family}:ital,wght@${uniqueTuples.join(';')}`;
        }
        else {
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
function createGoogleFont(family, defaultFallback, options = {}) {
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
    const entry = {
        kind: 'google',
        family,
        className,
        variableName,
        googleUrl,
        injectCSS,
    };
    (0, registry_1.registerFont)(entry);
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
const Inter = (opts) => createGoogleFont('Inter', ['system-ui', 'sans-serif'], opts);
exports.Inter = Inter;
const Roboto = (opts) => createGoogleFont('Roboto', ['system-ui', 'sans-serif'], opts);
exports.Roboto = Roboto;
const Open_Sans = (opts) => createGoogleFont('Open Sans', ['system-ui', 'sans-serif'], opts);
exports.Open_Sans = Open_Sans;
const Lato = (opts) => createGoogleFont('Lato', ['system-ui', 'sans-serif'], opts);
exports.Lato = Lato;
const Montserrat = (opts) => createGoogleFont('Montserrat', ['system-ui', 'sans-serif'], opts);
exports.Montserrat = Montserrat;
const Poppins = (opts) => createGoogleFont('Poppins', ['system-ui', 'sans-serif'], opts);
exports.Poppins = Poppins;
const Nunito = (opts) => createGoogleFont('Nunito', ['system-ui', 'sans-serif'], opts);
exports.Nunito = Nunito;
const Nunito_Sans = (opts) => createGoogleFont('Nunito Sans', ['system-ui', 'sans-serif'], opts);
exports.Nunito_Sans = Nunito_Sans;
const Raleway = (opts) => createGoogleFont('Raleway', ['system-ui', 'sans-serif'], opts);
exports.Raleway = Raleway;
const Ubuntu = (opts) => createGoogleFont('Ubuntu', ['system-ui', 'sans-serif'], opts);
exports.Ubuntu = Ubuntu;
const Oswald = (opts) => createGoogleFont('Oswald', ['system-ui', 'sans-serif'], opts);
exports.Oswald = Oswald;
const Outfit = (opts) => createGoogleFont('Outfit', ['system-ui', 'sans-serif'], opts);
exports.Outfit = Outfit;
const Manrope = (opts) => createGoogleFont('Manrope', ['system-ui', 'sans-serif'], opts);
exports.Manrope = Manrope;
const Space_Grotesk = (opts) => createGoogleFont('Space Grotesk', ['system-ui', 'sans-serif'], opts);
exports.Space_Grotesk = Space_Grotesk;
const DM_Sans = (opts) => createGoogleFont('DM Sans', ['system-ui', 'sans-serif'], opts);
exports.DM_Sans = DM_Sans;
const Work_Sans = (opts) => createGoogleFont('Work Sans', ['system-ui', 'sans-serif'], opts);
exports.Work_Sans = Work_Sans;
const Quicksand = (opts) => createGoogleFont('Quicksand', ['system-ui', 'sans-serif'], opts);
exports.Quicksand = Quicksand;
const Barlow = (opts) => createGoogleFont('Barlow', ['system-ui', 'sans-serif'], opts);
exports.Barlow = Barlow;
const Figtree = (opts) => createGoogleFont('Figtree', ['system-ui', 'sans-serif'], opts);
exports.Figtree = Figtree;
const Geist = (opts) => createGoogleFont('Geist', ['system-ui', 'sans-serif'], opts);
exports.Geist = Geist;
const Plus_Jakarta_Sans = (opts) => createGoogleFont('Plus Jakarta Sans', ['system-ui', 'sans-serif'], opts);
exports.Plus_Jakarta_Sans = Plus_Jakarta_Sans;
const Sora = (opts) => createGoogleFont('Sora', ['system-ui', 'sans-serif'], opts);
exports.Sora = Sora;
const Lexend = (opts) => createGoogleFont('Lexend', ['system-ui', 'sans-serif'], opts);
exports.Lexend = Lexend;
const Cabin = (opts) => createGoogleFont('Cabin', ['system-ui', 'sans-serif'], opts);
exports.Cabin = Cabin;
const Karla = (opts) => createGoogleFont('Karla', ['system-ui', 'sans-serif'], opts);
exports.Karla = Karla;
const Noto_Sans = (opts) => createGoogleFont('Noto Sans', ['system-ui', 'sans-serif'], opts);
exports.Noto_Sans = Noto_Sans;
const Rubik = (opts) => createGoogleFont('Rubik', ['system-ui', 'sans-serif'], opts);
exports.Rubik = Rubik;
const Mulish = (opts) => createGoogleFont('Mulish', ['system-ui', 'sans-serif'], opts);
exports.Mulish = Mulish;
const PT_Sans = (opts) => createGoogleFont('PT Sans', ['system-ui', 'sans-serif'], opts);
exports.PT_Sans = PT_Sans;
// Serif fonts
const Playfair_Display = (opts) => createGoogleFont('Playfair Display', ['Georgia', 'serif'], opts);
exports.Playfair_Display = Playfair_Display;
const Merriweather = (opts) => createGoogleFont('Merriweather', ['Georgia', 'serif'], opts);
exports.Merriweather = Merriweather;
const Lora = (opts) => createGoogleFont('Lora', ['Georgia', 'serif'], opts);
exports.Lora = Lora;
const PT_Serif = (opts) => createGoogleFont('PT Serif', ['Georgia', 'serif'], opts);
exports.PT_Serif = PT_Serif;
const Noto_Serif = (opts) => createGoogleFont('Noto Serif', ['Georgia', 'serif'], opts);
exports.Noto_Serif = Noto_Serif;
const Libre_Baskerville = (opts) => createGoogleFont('Libre Baskerville', ['Georgia', 'serif'], opts);
exports.Libre_Baskerville = Libre_Baskerville;
const DM_Serif_Display = (opts) => createGoogleFont('DM Serif Display', ['Georgia', 'serif'], opts);
exports.DM_Serif_Display = DM_Serif_Display;
const Bitter = (opts) => createGoogleFont('Bitter', ['Georgia', 'serif'], opts);
exports.Bitter = Bitter;
const Crimson_Text = (opts) => createGoogleFont('Crimson Text', ['Georgia', 'serif'], opts);
exports.Crimson_Text = Crimson_Text;
const Cormorant_Garamond = (opts) => createGoogleFont('Cormorant Garamond', ['Georgia', 'serif'], opts);
exports.Cormorant_Garamond = Cormorant_Garamond;
// Monospace fonts
const Roboto_Mono = (opts) => createGoogleFont('Roboto Mono', ['ui-monospace', 'monospace'], opts);
exports.Roboto_Mono = Roboto_Mono;
const Source_Code_Pro = (opts) => createGoogleFont('Source Code Pro', ['ui-monospace', 'monospace'], opts);
exports.Source_Code_Pro = Source_Code_Pro;
const JetBrains_Mono = (opts) => createGoogleFont('JetBrains Mono', ['ui-monospace', 'monospace'], opts);
exports.JetBrains_Mono = JetBrains_Mono;
const Fira_Code = (opts) => createGoogleFont('Fira Code', ['ui-monospace', 'monospace'], opts);
exports.Fira_Code = Fira_Code;
const IBM_Plex_Mono = (opts) => createGoogleFont('IBM Plex Mono', ['ui-monospace', 'monospace'], opts);
exports.IBM_Plex_Mono = IBM_Plex_Mono;
const Inconsolata = (opts) => createGoogleFont('Inconsolata', ['ui-monospace', 'monospace'], opts);
exports.Inconsolata = Inconsolata;
const Geist_Mono = (opts) => createGoogleFont('Geist Mono', ['ui-monospace', 'monospace'], opts);
exports.Geist_Mono = Geist_Mono;
const Space_Mono = (opts) => createGoogleFont('Space Mono', ['ui-monospace', 'monospace'], opts);
exports.Space_Mono = Space_Mono;
// Display / handwriting fonts
const Bebas_Neue = (opts) => createGoogleFont('Bebas Neue', ['Impact', 'sans-serif'], opts);
exports.Bebas_Neue = Bebas_Neue;
const Abril_Fatface = (opts) => createGoogleFont('Abril Fatface', ['Georgia', 'serif'], opts);
exports.Abril_Fatface = Abril_Fatface;
const Pacifico = (opts) => createGoogleFont('Pacifico', ['cursive'], opts);
exports.Pacifico = Pacifico;
const Permanent_Marker = (opts) => createGoogleFont('Permanent Marker', ['cursive'], opts);
exports.Permanent_Marker = Permanent_Marker;
const Dancing_Script = (opts) => createGoogleFont('Dancing Script', ['cursive'], opts);
exports.Dancing_Script = Dancing_Script;
const Lobster = (opts) => createGoogleFont('Lobster', ['cursive'], opts);
exports.Lobster = Lobster;
const Comfortaa = (opts) => createGoogleFont('Comfortaa', ['cursive'], opts);
exports.Comfortaa = Comfortaa;
const Righteous = (opts) => createGoogleFont('Righteous', ['Impact', 'sans-serif'], opts);
exports.Righteous = Righteous;
const Titan_One = (opts) => createGoogleFont('Titan One', ['Impact', 'sans-serif'], opts);
exports.Titan_One = Titan_One;
// ─── Dynamic helper ────────────────────────────────────────────────────────
/**
 * Load any Google Font by name (for fonts not pre-configured above).
 *
 *   import { googleFont } from '@vistagenic/vista/font/google';
 *   const font = googleFont('Fira Sans', { weight: ['400', '700'] });
 */
function googleFont(family, opts) {
    return createGoogleFont(family, ['system-ui', 'sans-serif'], opts);
}
