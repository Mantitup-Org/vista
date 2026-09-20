"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.netlifyAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cli_runner_1 = require("../cli-runner");
const preflight_1 = require("../preflight");
const runtime_pack_1 = require("../runtime-pack");
const utils_1 = require("../utils");
const NETLIFY_OUTPUT_DIR = '.vista/deploy/netlify';
function getNetlifyOutputDir(ctx) {
    return path_1.default.join(ctx.cwd, NETLIFY_OUTPUT_DIR);
}
function writeStaticNetlifyToml(ctx) {
    const targetFile = path_1.default.join(ctx.cwd, 'netlify.toml');
    const content = `[build]
  command = "npm run build"
  publish = ".vista/deploy/netlify"

[dev]
  command = "npm run dev"
  port = 3003
`;
    (0, utils_1.writeFileIfAllowed)(targetFile, content, ctx.force);
    return targetFile;
}
function writeFullRuntimeNetlifyToml(ctx) {
    const targetFile = path_1.default.join(ctx.cwd, 'netlify.toml');
    const content = `[build]
  command = "npm run build"
  publish = ".vista/deploy/netlify"
  functions = "netlify/functions"

[functions]
  node_bundler = "none"
  included_files = ["netlify/functions/.vista/**", "netlify/functions/node_modules/**"]

[dev]
  command = "npm run dev"
  port = 3003

[[redirects]]
  from = "/_vista/*"
  to = "/_vista/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ssr"
  status = 200
`;
    (0, utils_1.writeFileIfAllowed)(targetFile, content, ctx.force);
    return targetFile;
}
exports.netlifyAdapter = {
    id: 'netlify',
    requiredOutput: 'standalone',
    supportsFullRuntime: true,
    async preflight(ctx) {
        if ((0, runtime_pack_1.isStaticOnlyDeploy)(ctx)) {
            return (0, preflight_1.runStaticHostPreflight)(ctx);
        }
        return (0, preflight_1.runStandalonePreflight)(ctx);
    },
    async emit(ctx) {
        const outputDir = getNetlifyOutputDir(ctx);
        fs_1.default.rmSync(outputDir, { recursive: true, force: true });
        (0, utils_1.ensureDir)(outputDir);
        if ((0, runtime_pack_1.isStaticOnlyDeploy)(ctx)) {
            (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, outputDir);
            (0, utils_1.prepareStaticCdnOutput)(outputDir);
            const netlifyTomlPath = writeStaticNetlifyToml(ctx);
            return {
                status: 'emitted',
                target: 'netlify',
                artifactPaths: [outputDir, netlifyTomlPath],
                instructions: ['Static mode: Netlify serves pre-rendered pages only.'],
            };
        }
        (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, outputDir);
        (0, utils_1.copyDirectoryRecursive)(path_1.default.join(ctx.vistaDir, 'static'), path_1.default.join(outputDir, '_vista', 'static'));
        const functionDir = path_1.default.join(ctx.cwd, 'netlify', 'functions');
        fs_1.default.rmSync(functionDir, { recursive: true, force: true });
        (0, runtime_pack_1.writeNetlifySsrHandler)(functionDir);
        (0, utils_1.copyDirectoryRecursive)(ctx.vistaDir, path_1.default.join(functionDir, '.vista'));
        (0, runtime_pack_1.packRuntimeNodeModules)(ctx.cwd, functionDir);
        const netlifyTomlPath = writeFullRuntimeNetlifyToml(ctx);
        return {
            status: 'emitted',
            target: 'netlify',
            artifactPaths: [outputDir, functionDir, netlifyTomlPath],
            instructions: [
                'Netlify Functions run the Vista Flight SSR server.',
                'Deploy with: netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"',
            ],
        };
    },
    async deploy(ctx) {
        const emitted = await exports.netlifyAdapter.emit(ctx);
        if (ctx.dryRun) {
            return emitted;
        }
        const preflightMessages = await exports.netlifyAdapter.preflight(ctx);
        const { errors, warnings } = (0, preflight_1.splitPreflightMessages)(preflightMessages);
        if (errors.length > 0) {
            return {
                status: 'failed',
                target: 'netlify',
                warnings: [...warnings, ...errors],
            };
        }
        if (!(0, cli_runner_1.isCliAvailable)('netlify')) {
            return {
                status: 'emitted',
                target: 'netlify',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, 'Netlify CLI not found. Install with: npm i -g netlify-cli'],
                instructions: [
                    'Install Netlify CLI: npm i -g netlify-cli',
                    'Then run: netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"',
                ],
            };
        }
        const command = ctx.prod
            ? 'netlify deploy --prod --dir=".vista/deploy/netlify" --functions="netlify/functions"'
            : 'netlify deploy --dir=".vista/deploy/netlify" --functions="netlify/functions"';
        const result = (0, cli_runner_1.runCliCommand)(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
        if (!result.ok) {
            return {
                status: 'emitted',
                target: 'netlify',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, result.stderr || 'Netlify deploy failed.'],
                instructions: ['Run: netlify login', 'Or set NETLIFY_AUTH_TOKEN.'],
            };
        }
        return {
            status: 'deployed',
            target: 'netlify',
            url: (0, cli_runner_1.extractDeploymentUrl)(`${result.stdout}\n${result.stderr}`),
            artifactPaths: emitted.artifactPaths,
            warnings,
        };
    },
};
