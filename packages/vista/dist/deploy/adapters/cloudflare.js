"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudflareAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cli_runner_1 = require("../cli-runner");
const preflight_1 = require("../preflight");
const runtime_pack_1 = require("../runtime-pack");
const utils_1 = require("../utils");
const docker_1 = require("./docker");
const CLOUDFLARE_OUTPUT_DIR = '.vista/deploy/cloudflare';
function getCloudflareOutputDir(ctx) {
    return path_1.default.join(ctx.cwd, CLOUDFLARE_OUTPUT_DIR);
}
function writeStaticWranglerToml(ctx, outputDir) {
    const targetFile = path_1.default.join(ctx.cwd, 'wrangler.toml');
    const relativeOutput = path_1.default.relative(ctx.cwd, outputDir).replace(/\\/g, '/');
    const content = `name = "my-vista-app"
compatibility_date = "2024-09-01"
pages_build_output_dir = "${relativeOutput}"
`;
    (0, utils_1.writeFileIfAllowed)(targetFile, content, ctx.force);
    return targetFile;
}
function writeRoutesJson(outputDir) {
    const routesPath = path_1.default.join(outputDir, '_routes.json');
    const routes = {
        version: 1,
        include: ['/*'],
        exclude: ['/static/*'],
    };
    fs_1.default.writeFileSync(routesPath, `${JSON.stringify(routes, null, 2)}\n`, 'utf8');
    return routesPath;
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
exports.cloudflareAdapter = {
    id: 'cloudflare',
    requiredOutput: 'standalone',
    supportsFullRuntime: true,
    async preflight(ctx) {
        if ((0, runtime_pack_1.isStaticOnlyDeploy)(ctx)) {
            return (0, preflight_1.runStaticHostPreflight)(ctx);
        }
        return (0, preflight_1.runStandalonePreflight)(ctx);
    },
    async emit(ctx) {
        const outputDir = getCloudflareOutputDir(ctx);
        fs_1.default.rmSync(outputDir, { recursive: true, force: true });
        (0, utils_1.ensureDir)(outputDir);
        if ((0, runtime_pack_1.isStaticOnlyDeploy)(ctx)) {
            (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, outputDir);
            const routesPath = writeRoutesJson(outputDir);
            const redirectsPath = writeRedirects(outputDir);
            const wranglerPath = writeStaticWranglerToml(ctx, outputDir);
            return {
                status: 'emitted',
                target: 'cloudflare',
                artifactPaths: [outputDir, routesPath, redirectsPath, wranglerPath],
                instructions: [
                    'Static mode: Cloudflare Pages serves pre-rendered output.',
                    'For Flight SSR, omit deploy.output "static" and use Cloudflare Containers.',
                ],
            };
        }
        (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, outputDir);
        (0, runtime_pack_1.writeCloudflareContainerWorker)(outputDir);
        const wranglerPath = (0, runtime_pack_1.writeCloudflareFullRuntimeToml)(ctx);
        const dockerfilePath = path_1.default.join(ctx.cwd, 'Dockerfile');
        (0, utils_1.writeFileIfAllowed)(dockerfilePath, docker_1.DOCKERFILE_TEMPLATE, ctx.force);
        return {
            status: 'emitted',
            target: 'cloudflare',
            artifactPaths: [outputDir, wranglerPath, dockerfilePath],
            instructions: [
                'Cloudflare Workers cannot spawn Vista’s Node Flight process.',
                'Full SSR uses Cloudflare Containers (same Dockerfile as docker deploy).',
                'Run: npx wrangler login && npx wrangler deploy --prod',
                'Or build/run the Dockerfile on any Node host (Fly, Railway, Render).',
            ],
        };
    },
    async deploy(ctx) {
        const emitted = await exports.cloudflareAdapter.emit(ctx);
        if (ctx.dryRun) {
            return emitted;
        }
        const preflightMessages = await exports.cloudflareAdapter.preflight(ctx);
        const { errors, warnings } = (0, preflight_1.splitPreflightMessages)(preflightMessages);
        if (errors.length > 0) {
            return {
                status: 'failed',
                target: 'cloudflare',
                warnings: [...warnings, ...errors],
            };
        }
        const outputDir = getCloudflareOutputDir(ctx);
        const staticOnly = (0, runtime_pack_1.isStaticOnlyDeploy)(ctx);
        const wranglerCommand = staticOnly
            ? `wrangler pages deploy "${outputDir}" --project-name my-vista-app${ctx.prod ? '' : ' --branch preview'}`
            : ctx.prod
                ? 'wrangler deploy --prod'
                : 'wrangler deploy';
        if (!(0, cli_runner_1.isCliAvailable)('wrangler')) {
            return {
                status: 'emitted',
                target: 'cloudflare',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, 'Wrangler CLI not found. Install with: npm i -g wrangler'],
                instructions: emitted.instructions,
            };
        }
        const result = (0, cli_runner_1.runCliCommand)(wranglerCommand, { cwd: ctx.cwd, dryRun: ctx.dryRun });
        if (!result.ok) {
            return {
                status: 'emitted',
                target: 'cloudflare',
                artifactPaths: emitted.artifactPaths,
                warnings: [...warnings, result.stderr || 'Wrangler deploy failed.'],
                instructions: [
                    'Run: wrangler login',
                    'Or set CLOUDFLARE_API_TOKEN.',
                    ...(staticOnly ? [] : ['If Containers are unavailable, deploy the Dockerfile to Fly/Railway/Render.']),
                ],
            };
        }
        return {
            status: 'deployed',
            target: 'cloudflare',
            url: (0, cli_runner_1.extractDeploymentUrl)(`${result.stdout}\n${result.stderr}`),
            artifactPaths: emitted.artifactPaths,
            warnings,
        };
    },
};
