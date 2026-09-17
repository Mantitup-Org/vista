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
const utils_1 = require("../utils");
const NETLIFY_OUTPUT_DIR = '.vista/deploy/netlify';
function getNetlifyOutputDir(ctx) {
    return path_1.default.join(ctx.cwd, NETLIFY_OUTPUT_DIR);
}
function writeNetlifyToml(ctx) {
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
function writeRedirects(outputDir) {
    const redirectsPath = path_1.default.join(outputDir, '_redirects');
    const lines = [
        '/_vista/* /:splat 200',
        '/ /static/pages/index.html 200',
        '/rsc /static/pages/index.rsc 200',
        '/_rsc/* /static/pages/:splat.rsc 200',
        '/* /static/pages/:splat.html 200',
    ];
    fs_1.default.writeFileSync(redirectsPath, `${lines.join('\n')}\n`, 'utf8');
    return redirectsPath;
}
exports.netlifyAdapter = {
    id: 'netlify',
    requiredOutput: 'static',
    supportsFullRuntime: false,
    async preflight(ctx) {
        return (0, preflight_1.runStaticHostPreflight)(ctx);
    },
    async emit(ctx) {
        const outputDir = getNetlifyOutputDir(ctx);
        fs_1.default.rmSync(outputDir, { recursive: true, force: true });
        (0, utils_1.ensureDir)(outputDir);
        (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, outputDir);
        const redirectsPath = writeRedirects(outputDir);
        const netlifyTomlPath = writeNetlifyToml(ctx);
        return {
            status: 'emitted',
            target: 'netlify',
            artifactPaths: [outputDir, redirectsPath, netlifyTomlPath],
            instructions: [
                'Netlify deploy uses pre-rendered static output from .vista/deploy/netlify.',
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
        const outputDir = getNetlifyOutputDir(ctx);
        if (!(0, cli_runner_1.isCliAvailable)('netlify')) {
            return {
                status: 'emitted',
                target: 'netlify',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, 'Netlify CLI not found. Install with: npm i -g netlify-cli'],
                instructions: [
                    'Install Netlify CLI: npm i -g netlify-cli',
                    `Then run: netlify deploy --prod --dir="${outputDir}"`,
                ],
            };
        }
        const command = ctx.prod
            ? `netlify deploy --prod --dir="${outputDir}"`
            : `netlify deploy --dir="${outputDir}"`;
        const result = (0, cli_runner_1.runCliCommand)(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
        if (!result.ok) {
            return {
                status: 'emitted',
                target: 'netlify',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, result.stderr || 'Netlify deploy failed.'],
                instructions: [
                    'Run: netlify login',
                    'Or set NETLIFY_AUTH_TOKEN in your environment.',
                ],
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
