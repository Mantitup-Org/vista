"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCloudflareBuildEnvironment = isCloudflareBuildEnvironment;
exports.writeCloudflareBuildOutput = writeCloudflareBuildOutput;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function isCloudflareBuildEnvironment() {
    return process.env.CF_PAGES === '1' || process.env.CLOUDFLARE === '1';
}
function writeCloudflareBuildOutput(cwd, vistaDir, debug) {
    if (!isCloudflareBuildEnvironment()) {
        return;
    }
    const cfOutputDir = path_1.default.join(cwd, '.cloudflare', 'output');
    if (fs_1.default.existsSync(cfOutputDir)) {
        fs_1.default.rmSync(cfOutputDir, { recursive: true, force: true });
    }
    fs_1.default.mkdirSync(cfOutputDir, { recursive: true });
    const publicDir = path_1.default.join(cwd, 'public');
    if (fs_1.default.existsSync(publicDir)) {
        copyDirectoryRecursive(publicDir, cfOutputDir);
    }
    const staticDir = path_1.default.join(vistaDir, 'static');
    if (fs_1.default.existsSync(staticDir)) {
        copyDirectoryRecursive(staticDir, path_1.default.join(cfOutputDir, 'static'));
    }
    const clientCssPath = path_1.default.join(vistaDir, 'client.css');
    if (fs_1.default.existsSync(clientCssPath)) {
        fs_1.default.copyFileSync(clientCssPath, path_1.default.join(cfOutputDir, 'client.css'));
        fs_1.default.copyFileSync(clientCssPath, path_1.default.join(cfOutputDir, 'styles.css'));
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
    fs_1.default.writeFileSync(path_1.default.join(cfOutputDir, '_worker.js'), workerContent.trim());
    if (debug) {
        console.log('[vista:deploy] Generated internal Cloudflare Pages Build Output at .cloudflare/output/');
        console.log('[vista:deploy] Make sure to set your Cloudflare Pages build output directory to: .cloudflare/output');
    }
}
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir))
        return;
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const entries = fs_1.default.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const from = path_1.default.join(sourceDir, entry.name);
        const to = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(from, to);
        }
        else if (entry.isFile()) {
            fs_1.default.copyFileSync(from, to);
        }
    }
}
