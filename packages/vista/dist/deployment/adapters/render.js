"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.renderAdapter = {
    target: 'render',
    name: 'Render Web Services',
    generate(context) {
        const { cwd, vistaDir, debug, deploymentConfig } = context;
        const generatedFiles = [];
        // Standalone server is the deployment artifact for Render
        const standaloneDir = path_1.default.join(vistaDir, 'standalone');
        // Generate render.yaml blueprint if enabled and not already present
        if (deploymentConfig.generateBlueprints && !fs_1.default.existsSync(path_1.default.join(cwd, 'render.yaml'))) {
            const blueprintFiles = this.generateBlueprint(context);
            generatedFiles.push(...blueprintFiles);
        }
        if (debug) {
            console.log(`[vista:deploy:render] Prepared Render deployment configuration.`);
        }
        return {
            target: 'render',
            success: true,
            outputDirectory: standaloneDir,
            generatedFiles,
            notes: [
                'Render deployment target configured.',
                'Production server starts via npm run start or node .vista/standalone/server.js',
                'Healthcheck endpoint configured at /',
            ],
        };
    },
    generateBlueprint(context) {
        const { cwd, deploymentConfig } = context;
        const created = [];
        const renderYamlPath = path_1.default.join(cwd, 'render.yaml');
        if (!fs_1.default.existsSync(renderYamlPath)) {
            const pkgName = (() => {
                try {
                    const pkg = JSON.parse(fs_1.default.readFileSync(path_1.default.join(cwd, 'package.json'), 'utf8'));
                    return pkg.name?.replace(/[@/]/g, '-') || 'vista-app';
                }
                catch {
                    return 'vista-app';
                }
            })();
            const port = deploymentConfig.port || 3003;
            const renderYaml = [
                'services:',
                '  - type: web',
                `    name: ${pkgName}`,
                '    runtime: node',
                '    region: oregon',
                '    plan: free',
                '    buildCommand: npm install --no-audit --no-fund && npm run build',
                '    startCommand: npm run start',
                '    envVars:',
                '      - key: NODE_ENV',
                '        value: production',
                '      - key: PORT',
                `        value: "${port}"`,
                '    healthCheckPath: /',
                '',
            ].join('\n');
            fs_1.default.writeFileSync(renderYamlPath, renderYaml);
            created.push(renderYamlPath);
        }
        // Keep awake workflow blueprint (optional for free tier)
        const workflowPath = path_1.default.join(cwd, '.github', 'workflows', 'keep-render-awake.yml');
        if (!fs_1.default.existsSync(workflowPath) && fs_1.default.existsSync(path_1.default.join(cwd, '.github'))) {
            const workflowContent = [
                'name: Keep Render Awake',
                '',
                'on:',
                '  schedule:',
                '    - cron: "*/10 * * * *"',
                '  workflow_dispatch:',
                '',
                'jobs:',
                '  ping-render:',
                '    runs-on: ubuntu-latest',
                '    steps:',
                '      - name: Ping Render app',
                '        env:',
                '          RENDER_APP_URL: ${{ secrets.RENDER_APP_URL }}',
                '        run: curl -sS -L "$RENDER_APP_URL/"',
                '',
            ].join('\n');
            fs_1.default.mkdirSync(path_1.default.dirname(workflowPath), { recursive: true });
            fs_1.default.writeFileSync(workflowPath, workflowContent);
            created.push(workflowPath);
        }
        return created;
    },
};
