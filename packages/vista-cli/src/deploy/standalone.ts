import path from "path";
import fs from "fs-extra";
import { execSync } from "child_process";

/**
 * Copies the generated standalone server bundle (`.vista/standalone/server.js`)
 * and its `node_modules` into the deployment output directory.
 *
 * This is required for Vercel, Netlify, Render, and Docker deployments.
 * The function respects the `--dry-run` flag – it still writes the files
 * but does not attempt to package them into a function archive.
 */
export async function copyStandaloneServer(
  projectRoot: string,
  outDir: string,
  opts: { dryRun: boolean },
) {
  const serverSrc = path.resolve(projectRoot, ".vista", "standalone", "server.js");
  const nodeModulesSrc = path.resolve(projectRoot, ".vista", "standalone", "node_modules");

  if (!fs.existsSync(serverSrc)) {
    throw new Error("Standalone server.js not found. Did you run `vista build`?");
  }

  // Copy server.js
  await fs.copy(serverSrc, path.join(outDir, "server.js"));

  // Copy node_modules (if present)
  if (fs.existsSync(nodeModulesSrc)) {
    await fs.copy(nodeModulesSrc, path.join(outDir, "node_modules"));
  }

  // In dry‑run mode we stop after copying; otherwise we could invoke
  // platform‑specific packaging (e.g., `vercel build`), but that is out of scope.
  if (opts.dryRun) {
    console.log("⚡ Dry‑run: server bundle copied, packaging skipped.");
  }
}
