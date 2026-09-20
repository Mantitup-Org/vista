"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelAdapter = void 0;
exports.isVercelBuildEnvironment = isVercelBuildEnvironment;
exports.hasUserVercelConfig = hasUserVercelConfig;
exports.writeVercelBuildOutput = writeVercelBuildOutput;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cli_runner_1 = require("../cli-runner");
const preflight_1 = require("../preflight");
const runtime_pack_1 = require("../runtime-pack");
const utils_1 = require("../utils");
function isVercelBuildEnvironment() {
    return process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
}
function hasUserVercelConfig(cwd) {
    return fs_1.default.existsSync(path_1.default.join(cwd, 'vercel.json'));
}
function writeVercelBuildOutput(options) {
    const { cwd, vistaDir, debug, force = false } = options;
    if (!force && !isVercelBuildEnvironment()) {
        return false;
    }
    const standaloneServer = path_1.default.join(vistaDir, 'standalone', 'server.js');
    const staticOnly = !fs_1.default.existsSync(standaloneServer);
    if (staticOnly) {
        if (!force && hasUserVercelConfig(cwd)) {
            if (debug) {
                console.log('[vista:deploy] Found custom vercel.json, skipping internal Vercel output.');
            }
            return false;
        }
        const vercelOutputDir = path_1.default.join(cwd, '.vercel', 'output');
        const vercelStaticDir = path_1.default.join(vercelOutputDir, 'static');
        fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
        (0, utils_1.ensureDir)(vercelStaticDir);
        (0, utils_1.copyStaticHostAssets)(cwd, vistaDir, vercelStaticDir);
        fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify({ version: 3, routes: utils_1.STATIC_HOST_ROUTE_RULES }, null, 2));
        return true;
    }
    (0, runtime_pack_1.packVercelFullRuntime)({
        cwd,
        vistaDir,
        config: {},
        deployConfig: {
            target: 'vercel',
            output: 'standalone',
            prod: true,
            preferBuildOutputApi: true,
        },
        target: 'vercel',
        dryRun: true,
        skipBuild: true,
        prod: true,
        preview: false,
        force: true,
        debug,
    });
    if (debug) {
        console.log('[vista:deploy] Generated Vercel Node SSR output at .vercel/output/');
    }
    return true;
}
function writeVercelJson(ctx, fullRuntime) {
    const targetFile = path_1.default.join(ctx.cwd, 'vercel.json');
    const payload = fullRuntime
        ? {
            version: 2,
            buildCommand: 'npm run build',
            installCommand: 'npm install --legacy-peer-deps --no-audit --no-fund',
            framework: null,
        }
        : {
            version: 2,
            buildCommand: 'npm run build',
            outputDirectory: '.vista',
            framework: null,
            installCommand: 'npm install --legacy-peer-deps --no-audit --no-fund',
            devCommand: 'npm run dev',
            routes: utils_1.STATIC_HOST_ROUTE_RULES,
        };
    const result = (0, utils_1.writeFileIfAllowed)(targetFile, `${JSON.stringify(payload, null, 2)}\n`, ctx.force);
    return result.written || result.skipped ? targetFile : null;
}
exports.vercelAdapter = {
    id: 'vercel',
    requiredOutput: 'standalone',
    supportsFullRuntime: true,
    async preflight(ctx) {
        if ((0, runtime_pack_1.isStaticOnlyDeploy)(ctx)) {
            return (0, preflight_1.runStaticHostPreflight)(ctx);
        }
        return (0, preflight_1.runStandalonePreflight)(ctx);
    },
    async emit(ctx) {
        const artifactPaths = [];
        const warnings = [];
        const staticOnly = (0, runtime_pack_1.isStaticOnlyDeploy)(ctx);
        if (staticOnly) {
            const wrote = writeVercelBuildOutput({
                cwd: ctx.cwd,
                vistaDir: ctx.vistaDir,
                debug: ctx.debug,
                force: true,
            });
            if (wrote)
                artifactPaths.push(path_1.default.join(ctx.cwd, '.vercel', 'output'));
            artifactPaths.push(path_1.default.join(ctx.vistaDir, 'static'));
        }
        else {
            artifactPaths.push(...(0, runtime_pack_1.packVercelFullRuntime)(ctx));
        }
        const vercelJson = writeVercelJson(ctx, !staticOnly);
        if (vercelJson)
            artifactPaths.push(vercelJson);
        return {
            status: 'emitted',
            target: 'vercel',
            artifactPaths,
            warnings,
            instructions: staticOnly
                ? [
                    'Static mode: Vercel serves pre-rendered pages from .vista/static.',
                    'For Flight SSR, omit deploy.output "static" (default is standalone).',
                ]
                : [
                    'Vercel Build Output includes a Node.js serverless function that runs Flight SSR.',
                    'Deploy with: vercel deploy --prebuilt --prod',
                    'Connect the Git repo on Vercel; build command is "npm run build".',
                    'Cold start spawns the Flight upstream in-process. Raise maxDuration in .vc-config.json if pages are slow.',
                ],
        };
    },
    async deploy(ctx) {
        const emitted = await exports.vercelAdapter.emit(ctx);
        if (ctx.dryRun) {
            return emitted;
        }
        const preflightMessages = await exports.vercelAdapter.preflight(ctx);
        const { errors, warnings } = (0, preflight_1.splitPreflightMessages)(preflightMessages);
        if (errors.length > 0) {
            return {
                status: 'failed',
                target: 'vercel',
                warnings: [...warnings, ...errors],
            };
        }
        const hasBuildOutput = fs_1.default.existsSync(path_1.default.join(ctx.cwd, '.vercel', 'output', 'config.json'));
        const command = hasBuildOutput
            ? ctx.prod
                ? 'vercel deploy --prebuilt --prod --yes'
                : 'vercel deploy --prebuilt --yes'
            : ctx.prod
                ? 'vercel deploy --prod --yes'
                : 'vercel deploy --yes';
        if (!(0, cli_runner_1.isCliAvailable)('vercel')) {
            return {
                status: 'emitted',
                target: 'vercel',
                artifactPaths: emitted.artifactPaths,
                warnings: [
                    ...warnings,
                    ...(emitted.warnings ?? []),
                    'Vercel CLI not found. Install with: npm i -g vercel',
                ],
                instructions: [
                    'Install Vercel CLI: npm i -g vercel',
                    'Then run: vercel login && vercel deploy --prebuilt --prod',
                    'Or import the Git repository in the Vercel dashboard (build: npm run build).',
                ],
            };
        }
        const result = (0, cli_runner_1.runCliCommand)(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
        if (!result.ok) {
            return {
                status: 'emitted',
                target: 'vercel',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, result.stderr || 'Vercel deploy failed.'],
                instructions: ['Ensure you are logged in: vercel login', 'Or set VERCEL_TOKEN.'],
            };
        }
        return {
            status: 'deployed',
            target: 'vercel',
            url: (0, cli_runner_1.extractDeploymentUrl)(`${result.stdout}\n${result.stderr}`),
            artifactPaths: emitted.artifactPaths,
            warnings,
        };
    },
};
