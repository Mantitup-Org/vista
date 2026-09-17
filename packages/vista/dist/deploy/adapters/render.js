"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAdapter = void 0;
const path_1 = __importDefault(require("path"));
const cli_runner_1 = require("../cli-runner");
const preflight_1 = require("../preflight");
const utils_1 = require("../utils");
const RENDER_YAML_TEMPLATE = `services:
  - type: web
    name: my-vista-app
    runtime: node
    region: oregon
    plan: free
    buildCommand: |
      npm install --no-audit --no-fund
      npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3003"
    healthCheckPath: /
`;
exports.renderAdapter = {
    id: 'render',
    requiredOutput: 'standalone',
    supportsFullRuntime: true,
    async preflight(ctx) {
        return (0, preflight_1.runStandalonePreflight)(ctx);
    },
    async emit(ctx) {
        const renderYamlPath = path_1.default.join(ctx.cwd, 'render.yaml');
        const result = (0, utils_1.writeFileIfAllowed)(renderYamlPath, RENDER_YAML_TEMPLATE, ctx.force);
        const artifactPaths = [path_1.default.join(ctx.vistaDir, 'standalone', 'server.js')];
        if (result.written || result.skipped) {
            artifactPaths.push(renderYamlPath);
        }
        return {
            status: 'emitted',
            target: 'render',
            artifactPaths,
            instructions: [
                'Connect this repository on Render and select Blueprint (render.yaml).',
                'Or create a Web Service with buildCommand "npm run build" and startCommand "npm run start".',
            ],
        };
    },
    async deploy(ctx) {
        const emitted = await exports.renderAdapter.emit(ctx);
        if (ctx.dryRun) {
            return emitted;
        }
        const errors = await exports.renderAdapter.preflight(ctx);
        if (errors.length > 0) {
            return {
                status: 'failed',
                target: 'render',
                warnings: errors,
            };
        }
        if (!(0, cli_runner_1.isCliAvailable)('render')) {
            return {
                status: 'emitted',
                target: 'render',
                artifactPaths: emitted.artifactPaths,
                instructions: [
                    'Push to GitHub and connect the repo on https://dashboard.render.com',
                    'Render will detect render.yaml automatically.',
                    'Ensure NODE_ENV=production and PORT are set in service env vars.',
                ],
            };
        }
        const command = ctx.prod ? 'render deploy --confirm' : 'render deploy';
        const result = (0, cli_runner_1.runCliCommand)(command, { cwd: ctx.cwd, dryRun: ctx.dryRun });
        if (!result.ok) {
            return {
                status: 'emitted',
                target: 'render',
                artifactPaths: emitted.artifactPaths,
                warnings: [result.stderr || 'Render CLI deploy failed.'],
                instructions: emitted.instructions,
            };
        }
        return {
            status: 'deployed',
            target: 'render',
            url: (0, cli_runner_1.extractDeploymentUrl)(`${result.stdout}\n${result.stderr}`),
            artifactPaths: emitted.artifactPaths,
        };
    },
};
