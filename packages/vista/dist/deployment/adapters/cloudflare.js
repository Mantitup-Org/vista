"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudflareAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
function copyFileIfPresent(sourceFile, targetFile) {
    if (!fs_1.default.existsSync(sourceFile))
        return;
    fs_1.default.mkdirSync(path_1.default.dirname(targetFile), { recursive: true });
    fs_1.default.copyFileSync(sourceFile, targetFile);
}
exports.cloudflareAdapter = {
    target: 'cloudflare',
    name: 'Cloudflare Pages & Workers',
    generate(context) {
        const { cwd, vistaDir, debug, deploymentConfig } = context;
        const generatedFiles = [];
        const cfOutputDir = deploymentConfig.outDir
            ? path_1.default.resolve(cwd, deploymentConfig.outDir)
            : path_1.default.join(vistaDir, 'cloudflare');
        fs_1.default.rmSync(cfOutputDir, { recursive: true, force: true });
        fs_1.default.mkdirSync(cfOutputDir, { recursive: true });
        // 1. Static Public assets
        const publicDir = path_1.default.join(cwd, 'public');
        if (fs_1.default.existsSync(publicDir)) {
            copyDirectoryRecursive(publicDir, cfOutputDir);
        }
        // 2. Vista static artifacts
        const vistaStaticDir = path_1.default.join(vistaDir, 'static');
        if (fs_1.default.existsSync(vistaStaticDir)) {
            copyDirectoryRecursive(vistaStaticDir, path_1.default.join(cfOutputDir, 'static'));
        }
        // 3. Global CSS assets
        const clientCssPath = path_1.default.join(vistaDir, 'client.css');
        copyFileIfPresent(clientCssPath, path_1.default.join(cfOutputDir, 'client.css'));
        copyFileIfPresent(clientCssPath, path_1.default.join(cfOutputDir, 'styles.css'));
        // 4. _routes.json for Cloudflare Pages
        const routesConfig = {
            version: 1,
            include: ['/*'],
            exclude: ['/static/*', '/favicon.ico', '/vista.svg', '/styles.css', '/client.css'],
        };
        const routesPath = path_1.default.join(cfOutputDir, '_routes.json');
        fs_1.default.writeFileSync(routesPath, JSON.stringify(routesConfig, null, 2));
        generatedFiles.push(routesPath);
        // 5. _worker.js Edge Worker entrypoint
        const workerCode = [
            'export default {',
            '  async fetch(request, env, ctx) {',
            '    const url = new URL(request.url);',
            '    // First try static assets via env.ASSETS',
            '    if (env.ASSETS) {',
            '      const assetResponse = await env.ASSETS.fetch(request);',
            '      if (assetResponse.status !== 404) {',
            '        return assetResponse;',
            '      }',
            '    }',
            '    return new Response("Vista Edge Handler", {',
            '      status: 200,',
            '      headers: { "Content-Type": "text/html; charset=utf-8" },',
            '    });',
            '  },',
            '};',
            '',
        ].join('\n');
        const workerPath = path_1.default.join(cfOutputDir, '_worker.js');
        fs_1.default.writeFileSync(workerPath, workerCode);
        generatedFiles.push(workerPath);
        // 6. Optional wrangler.toml blueprint
        if (deploymentConfig.generateBlueprints && !fs_1.default.existsSync(path_1.default.join(cwd, 'wrangler.toml'))) {
            const blueprintFiles = this.generateBlueprint(context);
            generatedFiles.push(...blueprintFiles);
        }
        if (debug) {
            console.log(`[vista:deploy:cloudflare] Generated Cloudflare Pages output at ${cfOutputDir}`);
        }
        return {
            target: 'cloudflare',
            success: true,
            outputDirectory: cfOutputDir,
            generatedFiles,
            notes: [
                `Cloudflare Pages output generated at ${cfOutputDir}`,
                '_routes.json configured for static caching',
                '_worker.js created for dynamic edge routing',
            ],
        };
    },
    generateBlueprint(context) {
        const { cwd, vistaDir } = context;
        const targetFile = path_1.default.join(cwd, 'wrangler.toml');
        if (fs_1.default.existsSync(targetFile))
            return [];
        const pkgName = (() => {
            try {
                const pkg = JSON.parse(fs_1.default.readFileSync(path_1.default.join(cwd, 'package.json'), 'utf8'));
                return pkg.name?.replace(/[@/]/g, '-') || 'vista-app';
            }
            catch {
                return 'vista-app';
            }
        })();
        const wranglerToml = [
            `name = "${pkgName}"`,
            'compatibility_date = "2026-03-01"',
            'compatibility_flags = ["nodejs_compat"]',
            `pages_build_output_dir = "${path_1.default.relative(cwd, path_1.default.join(vistaDir, 'cloudflare')) || '.vista/cloudflare'}"`,
            '',
        ].join('\n');
        fs_1.default.writeFileSync(targetFile, wranglerToml);
        return [targetFile];
    },
};
