pub const CJS_LOADER: &str = r#"const cache = new Map();
globalThis.process = globalThis.process || { env: { NODE_ENV: "development" }, browser: true, cwd() { return "/"; }, versions: { node: "22.0.0" } };

function http(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send(null);
  if (xhr.status !== 200) {
    throw new Error("flashpack " + xhr.status + " " + url + "\n" + xhr.responseText);
  }
  return xhr.responseText;
}

function rawUrl(abs) {
  return "/_flashpack/raw/" + encodeURIComponent(abs);
}

function resolveSpec(spec, fromAbs) {
  return http("/_flashpack/resolve?spec=" + encodeURIComponent(spec) + "&from=" + encodeURIComponent(fromAbs)).trim();
}

export function requireCjs(rawUrlOrAbs) {
  const abs = rawUrlOrAbs.startsWith("/_flashpack/raw/")
    ? decodeURIComponent(rawUrlOrAbs.slice("/_flashpack/raw/".length))
    : rawUrlOrAbs;
  if (cache.has(abs)) return cache.get(abs).exports;
  const module = { exports: {} };
  cache.set(abs, module);
  if (abs.endsWith(".json")) {
    module.exports = JSON.parse(http(rawUrl(abs)));
    return module.exports;
  }
  const source = http(rawUrl(abs));
  const dir = abs.slice(0, Math.max(0, abs.lastIndexOf("/")));
  function localRequire(request) {
    return requireCjs(resolveSpec(request, abs));
  }
  const runner = new Function(
    "exports",
    "require",
    "module",
    "process",
    "__filename",
    "__dirname",
    source + "\n//# sourceURL=" + abs
  );
  runner(module.exports, localRequire, module, globalThis.process, abs, dir);
  return module.exports;
}
"#;

pub const FS_SHIM: &str = r#"function nodeFs() {
  if (typeof XMLHttpRequest !== "undefined") return null;
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") return null;
  return process.getBuiltinModule("node:fs");
}
function nodePath(target) {
  const path = process.getBuiltinModule("node:path");
  const url = process.getBuiltinModule("node:url");
  let file = typeof target === "string" ? target : (target && target.href) || String(target);
  if (file.startsWith("file:")) file = url.fileURLToPath(file);
  const normalized = String(file).replaceAll("\\", "/");
  const marker = "/.flash/dev/modules/";
  const index = normalized.indexOf(marker);
  if (index !== -1) return path.join(normalized.slice(0, index), normalized.slice(index + marker.length));
  return file;
}
export function readFileSync(target, encoding) {
  const href = typeof target === "string" ? target : (target && target.href) || String(target);
  const fs = nodeFs();
  if (fs) return fs.readFileSync(nodePath(target), encoding || "utf8");
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/_flashpack/source?p=" + encodeURIComponent(href), false);
  xhr.send(null);
  if (xhr.status !== 200) {
    const error = new Error("ENOENT: " + href);
    error.code = "ENOENT";
    throw error;
  }
  return xhr.responseText;
}
export function existsSync(target) {
  const fs = nodeFs();
  if (fs) return fs.existsSync(nodePath(target));
  return false;
}
export default { readFileSync, existsSync };
"#;

pub const FONT_SHIM: &str = r#"function load(family, options) {
  const settings = options || {};
  const variable = settings.variable || ("--font-" + family.toLowerCase().replace(/\s+/g, "-"));
  const className = "flashpack-font-" + family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fallback = (settings.fallback || ["system-ui", "sans-serif"]).join(", ");
  const fontFamily = "'" + family + "', " + fallback;
  if (typeof document !== "undefined" && !document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = ":root{" + variable + ":" + fontFamily + ";}";
    document.head.appendChild(style);
    const weights = settings.weight ? [].concat(settings.weight).join(";") : "400;500;600;700";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family) + ":wght@" + weights + "&display=swap";
    document.head.appendChild(link);
  }
  return { className, variable, style: { fontFamily } };
}
function font(family) {
  return function define(options) { return load(family, options); };
}
export const Geist = font("Geist");
export const Geist_Mono = font("Geist Mono");
export const Manrope = font("Manrope");
export const Inter = font("Inter");
"#;

pub const METADATA_SHIM: &str = r#"import { jsxDEV } from "/_flashpack/mod/react/jsx-dev-runtime";
export function JsonLd({ data, id }) {
  return jsxDEV("script", {
    id,
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) }
  }, void 0, false, void 0, void 0);
}
export function sitemap() { return []; }
export function robots() { return {}; }
export function manifest() { return {}; }
"#;

pub const THEME_SHIM: &str = r#"import { jsxDEV } from "/_flashpack/mod/react/jsx-dev-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "/_flashpack/mod/react";
const ThemeContext = createContext(null);
const STORAGE_KEY = "vista-theme";
const ORDER = ["system", "light", "dark"];
function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function resolve(theme) {
  return theme === "system" ? systemTheme() : theme;
}
function apply(theme) {
  const resolved = resolve(theme);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.dataset.theme = theme;
  root.style.colorScheme = resolved;
}
export function ThemeProvider({ children, defaultTheme }) {
  const fallback = defaultTheme || "system";
  const [theme, setTheme] = useState(fallback);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored === "light" || stored === "dark" || stored === "system" ? stored : fallback;
    setTheme(next);
    apply(next);
    setMounted(true);
  }, [fallback]);
  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
  }, [mounted, theme]);
  const cycleTheme = useCallback(() => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  }, []);
  const value = useMemo(() => ({
    theme,
    resolvedTheme: typeof window === "undefined" ? "dark" : resolve(theme),
    setTheme,
    cycleTheme,
    mounted
  }), [theme, setTheme, cycleTheme, mounted]);
  return jsxDEV(ThemeContext.Provider, { value, children }, void 0, false, void 0, void 0);
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within a ThemeProvider.");
  return value;
}
export function ThemeScript({ defaultTheme }) {
  const fallback = defaultTheme || "system";
  return jsxDEV("script", {
    dangerouslySetInnerHTML: {
      __html: `(function(){var runtime=Function('return this')();var storageKey='vista-theme';var defaultTheme='${fallback}';var mediaQuery='(prefers-color-scheme: dark)';function sanitize(value){return value==='system'||value==='light'||value==='dark'?value:defaultTheme;}function resolve(theme){if(theme==='system'){return runtime.matchMedia(mediaQuery).matches?'dark':'light';}return theme;}function apply(theme){var resolved=resolve(theme);var root=runtime['doc'+'ument'].documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.dataset.theme=theme;root.style.colorScheme=resolved;}var stored=sanitize(runtime['local'+'Storage'].getItem(storageKey));apply(stored);}());`
    }
  }, void 0, false, void 0, void 0);
}
"#;

pub const LINK_SHIM: &str = r#"import { jsxDEV } from "/_flashpack/mod/react/jsx-dev-runtime";
export default function Link({ href, children, className, style, target, rel, onClick, title, id }) {
  const url = typeof href === "string" ? href : (href && href.href) || "/";
  return jsxDEV("a", { href: url, children, className, style, target, rel, onClick, title, id }, void 0, false, void 0, void 0);
}
"#;

pub const IMAGE_SHIM: &str = r#"import { jsxDEV } from "/_flashpack/mod/react/jsx-dev-runtime";
export default function Image({ src, alt, className, width, height, style, id }) {
  return jsxDEV("img", { src, alt, className, width, height, style, id }, void 0, false, void 0, void 0);
}
"#;

pub const NAVIGATION_SHIM: &str = r#"export function usePathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
export function useRouter() {
  return {
    push(href) {
      if (typeof window.__VISTA_NAVIGATE__ === "function") window.__VISTA_NAVIGATE__(href);
      else window.location.assign(href);
    },
    replace(href) {
      if (typeof window.__VISTA_NAVIGATE__ === "function") window.__VISTA_NAVIGATE__(href, { replace: true });
      else window.location.replace(href);
    }
  };
}
"#;

fn is_app_document(markup: &str) -> bool {
    let trimmed = markup.trim_start();
    let head = trimmed.get(..16).unwrap_or(trimmed).to_ascii_lowercase();
    head.starts_with("<!doctype html") || head.starts_with("<html")
}

fn inject_after_tag(html: &str, tag: &str, injection: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let Some(start) = lower.find(tag) else {
        return html.to_string();
    };
    let Some(rel_end) = html[start..].find('>') else {
        return html.to_string();
    };
    let insert_at = start + rel_end + 1;
    let mut out = String::with_capacity(html.len() + injection.len());
    out.push_str(&html[..insert_at]);
    out.push_str(injection);
    out.push_str(&html[insert_at..]);
    out
}

fn inject_before_last(html: &str, marker: &str, injection: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let Some(index) = lower.rfind(marker) else {
        return format!("{html}{injection}");
    };
    let mut out = String::with_capacity(html.len() + injection.len());
    out.push_str(&html[..index]);
    out.push_str(injection);
    out.push_str(&html[index..]);
    out
}

fn dev_asset_url(path: &str, generation: u64) -> String {
    format!("{path}?v={generation}")
}

// Keep body hidden until boot finishes, but never hide the error overlay / devtools
// badge — otherwise a crash before `data-vista-ready` looks like a blank white page.
const BOOT_HOLD: &str = r#"<style id="__vista-boot-hold">html:not([data-vista-ready]) body{visibility:hidden}html:not([data-vista-ready]),html:not([data-vista-ready]) body{overflow:hidden!important}html:not([data-vista-ready]) #__vista-dev-error-overlay,html:not([data-vista-ready]) #__vista-devtools-root{visibility:visible!important}</style>"#;

fn encode_query_component(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

pub fn app_document(errors: &str, markup: &str, generation: u64, request_path: &str) -> String {
    let head_assets = format!(
        "{BOOT_HOLD}{}<link rel=\"stylesheet\" href=\"{}\"/>",
        concat!(
            r#"<meta charset="utf-8"/>"#,
            r#"<meta name="viewport" content="width=device-width, initial-scale=1"/>"#
        ),
        dev_asset_url("/_flashpack/app.css", generation)
    );
    let error_boot = if errors.trim().is_empty() {
        String::new()
    } else {
        let payload = serde_json::to_string(errors.trim()).unwrap_or_else(|_| "\"Server Error\"".to_string());
        format!(
            "<script>(function(){{var message={payload};function reveal(){{try{{document.documentElement.setAttribute('data-vista-ready','');}}catch(e){{}}}}function show(){{reveal();var overlay=window.__VISTA_DEV_ERROR_OVERLAY__;if(overlay&&typeof overlay.show==='function'){{overlay.show([message]);return true;}}return false;}}if(!show()){{var tries=0;var timer=setInterval(function(){{tries+=1;if(show()||tries>80){{reveal();clearInterval(timer);}}}},50);}}}})();</script>"
        )
    };
    let scripts = format!(
        "<script src=\"{}\"></script><script src=\"/_flashpack/boot.js?p={}&v={generation}\"></script>{}{}",
        dev_asset_url("/_flashpack/dev.js", generation),
        encode_query_component(request_path),
        r#"<script>(function(){let generation=0;let refreshing=false;const waitForSoft=async()=>{for(let i=0;i<50;i++){const soft=window.__VISTA_SOFT_HMR__;if(typeof soft==='function'&&!soft.__pending)return soft;await new Promise((r)=>setTimeout(r,40));}return typeof window.__VISTA_SOFT_HMR__==='function'?window.__VISTA_SOFT_HMR__:null;};const watch=async()=>{if(refreshing)return;try{const body=await fetch('/_flashpack/status').then((res)=>res.json());if(!(generation&&body.generation!==generation)){generation=body.generation;return;}const next=body.generation;/* Compile errors still hard-reload so SSR/overlay stay in sync. */if(body.errors>0){generation=next;location.reload();return;}refreshing=true;try{const soft=await waitForSoft();if(!soft){console.warn('[flashpack] soft HMR unavailable — full reload');generation=next;location.reload();return;}await soft(next);generation=next;}catch(error){console.error('[flashpack] soft HMR failed, falling back to full reload',error);generation=next;location.reload();}finally{refreshing=false;}}catch{}};watch();setInterval(watch,400);})();</script>"#,
        error_boot
    );
    if is_app_document(markup) {
        // The app root already rendered <html>. Nesting that inside <div id="root">
        // makes the browser relocate <head> and <script>, so hydration sees whitespace
        // where ThemeScript's script should be.
        let mut head = head_assets;
        if !markup.to_ascii_lowercase().contains("<title") {
            head.push_str("<title>Vista (flashpack)</title>");
        }
        let with_head = inject_after_tag(markup, "<head", &head);
        return inject_before_last(&with_head, "</body>", &scripts);
    }

    format!(
        "<!DOCTYPE html>
<html lang=\"en\">
<head>
  {head_assets}
  <title>Vista (flashpack)</title>
</head>
<body>
  <div id=\"root\">{markup}</div>
  {scripts}
</body>
</html>"
    )
}

pub fn entry_module() -> &'static str {
    r##"import { createRoot, hydrateRoot } from "/_flashpack/mod/react-dom/client";
import { jsx } from "/_flashpack/mod/react/jsx-runtime";

function partsOf(pathname) {
  return String(pathname || "/").split("?")[0].split("#")[0].split("/").filter(Boolean);
}

function matchSegments(segments, parts) {
  const params = {};
  let pi = 0;
  let staticCount = 0;
  let dynamicCount = 0;
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      params[seg.slice(4, -1)] = parts.slice(pi);
      dynamicCount += 1;
      pi = parts.length;
      continue;
    }
    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (pi >= parts.length) return null;
      params[seg.slice(1, -1)] = parts[pi];
      dynamicCount += 1;
      pi += 1;
      continue;
    }
    if (pi >= parts.length || parts[pi] !== seg) return null;
    staticCount += 1;
    pi += 1;
  }
  if (pi !== parts.length) return null;
  return { params, staticCount, dynamicCount };
}

function pickPage(pages, parts) {
  let best = null;
  for (const page of pages) {
    const matched = matchSegments(page.segments || [], parts);
    if (!matched) continue;
    const candidate = { page, ...matched };
    if (!best || candidate.staticCount > best.staticCount || (candidate.staticCount === best.staticCount && candidate.dynamicCount < best.dynamicCount)) {
      best = candidate;
    }
  }
  return best;
}

function layoutApplies(segments, parts) {
  let pi = 0;
  for (const seg of segments || []) {
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    if (seg.startsWith("[...")) return true;
    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (pi >= parts.length) return false;
      pi += 1;
      continue;
    }
    if (parts[pi] !== seg) return false;
    pi += 1;
  }
  return true;
}

async function renderNode(Component, props) {
  if (typeof Component === "function" && Component.constructor && Component.constructor.name === "AsyncFunction") {
    return await Component(props);
  }
  return jsx(Component, props);
}

let routesPromise = null;
function loadRoutes() {
  if (!routesPromise) {
    routesPromise = fetch("/_flashpack/routes").then((res) => res.json());
  }
  return routesPromise;
}

function bustStylesheet(generation) {
  const links = Array.from(
    document.querySelectorAll('link[rel="stylesheet"][href*="/_flashpack/app.css"]')
  );
  for (const link of links) {
    const url = new URL(link.href, location.href);
    url.searchParams.set("v", String(generation));
    const nextHref = url.pathname + url.search;
    if (link.href.endsWith(url.search) && link.getAttribute("href") && link.getAttribute("href").includes("v=" + generation)) {
      continue;
    }
    const next = link.cloneNode(false);
    next.setAttribute("href", nextHref);
    next.onload = () => {
      try { link.remove(); } catch (_) {}
    };
    next.onerror = () => {
      try { next.remove(); } catch (_) {}
    };
    if (link.parentNode) link.parentNode.insertBefore(next, link.nextSibling);
  }
}

async function softHmr(generation) {
  // Keep the document painted — no BOOT_HOLD, no location.reload().
  // Module URLs are cache-busted via /_flashpack/routes?v=generation.
  bustStylesheet(generation);
  routesPromise = null;
  await show(location.pathname);
  try {
    const indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
    if (indicator && typeof indicator.pulse === "function") indicator.pulse("hmr", 420);
  } catch (_) {}
}
window.__VISTA_SOFT_HMR__ = softHmr;

async function buildTree(pathname) {
  const table = await loadRoutes();
  const parts = partsOf(pathname);
  const match = pickPage(table.pages || [], parts);
  const rootMod = await import(table.root);
  if (!match) {
    return jsx(rootMod.default, { children: jsx("p", { children: "This page could not be found." }) });
  }
  const pageMod = await import(match.page.module);
  let node = await renderNode(pageMod.default, { params: match.params });
  const layouts = (table.layouts || [])
    .filter((layout) => layoutApplies(layout.segments, parts))
    .sort((a, b) => (a.segments || []).length - (b.segments || []).length);
  for (const layout of layouts) {
    const layoutMod = await import(layout.module);
    node = await renderNode(layoutMod.default, { params: match.params, children: node });
  }
  return jsx(rootMod.default, { children: node });
}

let reactRoot = null;
function stripEditorAttrs(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll("[data-cursor-ref]").forEach((node) => node.removeAttribute("data-cursor-ref"));
}
function reveal() {
  document.documentElement.setAttribute("data-vista-ready", "");
}
async function show(pathname) {
  const tree = await buildTree(pathname);
  const mount = document.getElementById("root");
  const target = mount || document;
  stripEditorAttrs(target);
  if (!reactRoot) {
    if (mount) {
      reactRoot = mount.childNodes.length > 0 ? hydrateRoot(mount, tree) : createRoot(mount);
      if (mount.childNodes.length === 0) reactRoot.render(tree);
    } else {
      reactRoot = hydrateRoot(document, tree);
    }
    return;
  }
  reactRoot.render(tree);
}

function isInternalNavigation(anchor, event) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  let url;
  try { url = new URL(href, location.href); } catch { return false; }
  return url.origin === location.origin;
}

let navQueue = Promise.resolve();
function navigate(href, options) {
  const opts = options || {};
  navQueue = navQueue.then(async () => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) {
      location.assign(url.href);
      return;
    }
    const next = url.pathname + url.search + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next === current) return;
    if (opts.replace) history.replaceState({}, "", next);
    else history.pushState({}, "", next);
    await show(url.pathname);
    if (opts.scroll !== false) window.scrollTo(0, 0);
  }).catch((error) => {
    console.error(error);
  });
  return navQueue;
}

try {
  await show(location.pathname);
} catch (error) {
  console.error(error);
  try {
    var overlay = window.__VISTA_DEV_ERROR_OVERLAY__;
    var text = error && error.stack ? String(error.stack) : String(error || "Boot failed");
    if (overlay && typeof overlay.show === "function") overlay.show(["Runtime Error\n\n" + text]);
  } catch (_) {}
} finally {
  reveal();
}
window.__VISTA_NAVIGATE__ = navigate;
document.addEventListener("click", (event) => {
  const anchor = event.target && event.target.closest ? event.target.closest("a") : null;
  if (!isInternalNavigation(anchor, event)) return;
  event.preventDefault();
  navigate(anchor.getAttribute("href"));
}, true);
window.addEventListener("popstate", () => {
  navQueue = navQueue.then(() => show(location.pathname)).catch((error) => console.error(error));
});
"##
}

pub fn cjs_facade(raw: &str, names: &[String]) -> String {
    let mut source = format!(
        "import {{ requireCjs }} from \"/_flashpack/cjs-loader.js\";\nconst mod = requireCjs(\"{raw}\");\nexport default (mod && mod.__esModule && Object.prototype.hasOwnProperty.call(mod, \"default\")) ? mod.default : mod;\n"
    );
    for name in names {
        source.push_str(&format!("export const {name} = mod.{name};\n"));
    }
    source
}
