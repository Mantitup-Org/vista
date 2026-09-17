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
    const config = {
        version: 3,
        routes: utils_1.STATIC_HOST_ROUTE_RULES,
    };
    fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));
    if (debug) {
        console.log('[vista:deploy] Generated internal Vercel Build Output at .vercel/output/');
    }
    return true;
}
function writeLegacyVercelJson(ctx) {
    const targetFile = path_1.default.join(ctx.cwd, 'vercel.json');
    const payload = {
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
    requiredOutput: 'static',
    supportsFullRuntime: false,
    async preflight(ctx) {
        return (0, preflight_1.runStaticHostPreflight)(ctx);
    },
    async emit(ctx) {
        const artifactPaths = [];
        const warnings = [];
        if (ctx.deployConfig.preferBuildOutputApi) {
            const wrote = writeVercelBuildOutput({
                cwd: ctx.cwd,
                vistaDir: ctx.vistaDir,
                debug: ctx.debug,
                force: true,
            });
            if (wrote) {
                artifactPaths.push(path_1.default.join(ctx.cwd, '.vercel', 'output'));
            }
        }
        else if (!hasUserVercelConfig(ctx.cwd) || ctx.force) {
            const legacyPath = writeLegacyVercelJson(ctx);
            if (legacyPath)
                artifactPaths.push(legacyPath);
        }
        else {
            artifactPaths.push(path_1.default.join(ctx.cwd, 'vercel.json'));
        }
        (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, path_1.default.join(ctx.vistaDir));
        artifactPaths.push(path_1.default.join(ctx.vistaDir, 'static'));
        return {
            status: 'emitted',
            target: 'vercel',
            artifactPaths,
            warnings,
            instructions: [
                'Vercel deploy uses pre-rendered static pages from .vista/static.',
                'For full SSR, server actions, and typed API, deploy with --target render or --target docker.',
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
                    'Then run: vercel deploy --prod',
                    'Or connect this repository in the Vercel dashboard with buildCommand "npm run build".',
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
                instructions: [
                    'Ensure you are logged in: vercel login',
                    'Or set VERCEL_TOKEN in your environment.',
                    'You can also deploy from the Vercel dashboard using npm run build.',
                ],
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
