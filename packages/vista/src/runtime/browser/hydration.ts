/**
 * Fixes duplicate client script tags during hydration
 */
export function hydrate() {
  const scripts = document.querySelectorAll('script[src^="/client"]');
  const seen = new Set();
  
  scripts.forEach(script => {
    const src = script.getAttribute('src');
    if (seen.has(src)) {
      script.remove(); // Remove duplicate client chunks
    } else {
      seen.add(src);
    }
  });

  // Continue with standard React 19 hydration...
}
