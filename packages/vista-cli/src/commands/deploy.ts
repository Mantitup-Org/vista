import { Command } from "commander";
import path from "path";
import fs from "fs-extra";
import { getPlatformTemplates } from "../deploy/platformTemplates";
import { generateCloudflareRedirects } from "../deploy/cloudflare";
import { copyStandaloneServer } from "../deploy/standalone";

export const deploy = new Command("deploy")
  .description("Generate deployment artifacts for a target platform")
  .option("-t, --target <platform>", "Target platform (cloudflare, vercel, netlify, render, docker)", "cloudflare")
  .option("--dry-run", "Emit files without packaging", false)
  .option("-f, --force", "Overwrite existing files", false)
  .action(async (opts) => {
    const cwd = process.cwd();
    const outDir = path.resolve(cwd, ".vista", "deploy");
    await fs.ensureDir(outDir);

    // 1️⃣ Resolve platform‑specific files (Dockerfile, render.yaml, etc.)
    const platformFiles = await getPlatformTemplates(opts.target, cwd);
    for (const [src, dest] of platformFiles) {
      await fs.copy(src, path.join(outDir, dest), { overwrite: opts.force });
    }

    // 2️⃣ Cloudflare static specific handling
    if (opts.target === "cloudflare") {
      const redirects = generateCloudflareRedirects(cwd);
      await fs.writeFile(path.join(outDir, "_redirects"), redirects);
    }

    // 3️⃣ Standalone targets need the generated server bundle
    if (["vercel", "netlify", "render", "docker"].includes(opts.target)) {
      await copyStandaloneServer(cwd, outDir, opts);
    }

    console.log(`✅ Deployment files for "${opts.target}" written to ${outDir}`);
    if (opts.dryRun) {
      console.log("⚡ Dry‑run mode – no packaging performed.");
    }
  });
