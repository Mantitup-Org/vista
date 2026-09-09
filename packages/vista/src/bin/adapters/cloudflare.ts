import fs from 'fs';
import path from 'path';

export function isCloudflareBuildEnvironment(): boolean {
  return process.env.CF_PAGES === '1' || process.env.CLOUDFLARE === '1';
}

export function writeCloudflareBuildOutput(cwd: string, vistaDir: string, debug?: boolean): void {
  if (!isCloudflareBuildEnvironment()) {
    return;
  }

  const cfOutputDir = path.join(cwd, '.cloudflare', 'output');
  
  if (fs.existsSync(cfOutputDir)) {
    fs.rmSync(cfOutputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(cfOutputDir, { recursive: true });

  const publicDir = path.join(cwd, 'public');
  if (fs.existsSync(publicDir)) {
    copyDirectoryRecursive(publicDir, cfOutputDir);
  }

  const staticDir = path.join(vistaDir, 'static');
  if (fs.existsSync(staticDir)) {
    copyDirectoryRecursive(staticDir, path.join(cfOutputDir, 'static'));
  }

  const clientCssPath = path.join(vistaDir, 'client.css');
  if (fs.existsSync(clientCssPath)) {
    fs.copyFileSync(clientCssPath, path.join(cfOutputDir, 'client.css'));
    fs.copyFileSync(clientCssPath, path.join(cfOutputDir, 'styles.css'));
  }

  const workerContent = `
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status < 400) {
        return response;
      }
    } catch (e) {
      // Ignore
    }

    let rewritePath = url.pathname;
    if (rewritePath === '/') rewritePath = '/index';
    
    const isRSC = request.headers.get('accept')?.includes('text/x-component');
    
    if (isRSC) {
      url.pathname = \`/static/pages\${rewritePath}.rsc\`;
    } else {
      url.pathname = \`/static/pages\${rewritePath}.html\`;
    }

    const staticFallback = await env.ASSETS.fetch(url.toString(), request);
    if (staticFallback.status < 400) {
      return staticFallback;
    }

    return new Response('Vista.js Edge Router: SSR endpoints require Node.js runtime. Please migrate to Edge APIs or use Vercel/Render for full SSR support.', { status: 501 });
  }
};
`;

  fs.writeFileSync(path.join(cfOutputDir, '_worker.js'), workerContent.trim());

  if (debug) {
    console.log('[vista:deploy] Generated internal Cloudflare Pages Build Output at .cloudflare/output/');
    console.log('[vista:deploy] Make sure to set your Cloudflare Pages build output directory to: .cloudflare/output');
  }
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}
