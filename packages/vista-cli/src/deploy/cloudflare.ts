import path from "path";
import fs from "fs-extra";

/**
 * Generates the correct `_redirects` content for Cloudflare Pages.
 *
 * The rule ensures that requests for `.rsc` assets are served as raw files
 * (application/octet-stream) and are **not** rewritten to HTML. Previously
 * two rules were emitted, causing the double‑rewrite bug.
 */
export function generateCloudflareRedirects(projectRoot: string): string {
  // Base rule for SPA fallback
  const fallback = `/*    /index.html   200`;

  // Identity rule for .rsc files – must appear **before** the fallback.
  const rscRule = `/*.rsc    /:splat   200`;

  // If the project already provides a custom _redirects, preserve it but
  // ensure the .rsc rule is present and not duplicated.
  const customPath = path.join(projectRoot, "_redirects");
  if (fs.existsSync(customPath)) {
    const custom = fs.readFileSync(customPath, "utf8").split("\n");
    const hasRsc = custom.some((line) => line.trim().startsWith("/*.rsc"));
    const lines = hasRsc ? custom : [rscRule, ...custom];
    // Ensure fallback is present once
    const hasFallback = lines.some((l) => l.trim().startsWith("/*"));
    if (!hasFallback) lines.push(fallback);
    return lines.filter(Boolean).join("\n");
  }

  // Default minimal redirects
  return `${rscRule}\n${fallback}`;
}
