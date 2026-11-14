import fs from 'node:fs';
import path from 'node:path';
import { DOCKERFILE_TEMPLATE, RENDER_YAML_TEMPLATE, CLOUDFLARE_REDIRECTS, WRANGLER_PAGES_CONFIG } from '../deploy/templates';

export async function handleDeploy(options: { target: string, dryRun: boolean, force: boolean }) {
  const outputDir = options.dryRun ? './.vista/deploy-preview' : './';
  const isStatic = options.target === 'cloudflare-pages' || options.target === 'netlify-static';

  console.log(`🚀 Preparing deployment for target: ${options.target} (${isStatic ? 'static' : 'standalone'})`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Handle Cloudflare Pages Specifics
  if (options.target === 'cloudflare-pages') {
    fs.writeFileSync(path.join(outputDir, '_redirects'), CLOUDFLARE_REDIRECTS);
    fs.writeFileSync(path.join(outputDir, 'wrangler.toml'), WRANGLER_PAGES_CONFIG);
  }

  // 2. Handle Standalone Server Targets (Vercel, Netlify SSR, Docker, Render)
  if (!isStatic) {
    const standaloneDir = path.join(process.cwd(), '.vista/standalone');
    if (!fs.existsSync(standaloneDir) && !options.dryRun) {
      throw new Error("Standalone build missing. Run 'vista build' first.");
    }

    if (options.target === 'docker' || options.target === 'render') {
      fs.writeFileSync(path.join(outputDir, 'Dockerfile'), DOCKERFILE_TEMPLATE);
      if (options.target === 'render') {
        fs.writeFileSync(path.join(outputDir, 'render.yaml'), RENDER_YAML_TEMPLATE('vista-app'));
      }
    }

    // Ensure server.js is present in the deployment pack
    if (options.dryRun) {
      console.log(`[Dry Run] Would copy .vista/standalone/server.js to ${outputDir}`);
    }
  }

  console.log(`✅ Deployment files generated in ${outputDir}`);
}
