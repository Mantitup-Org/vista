import fs from 'fs';
import path from 'path';
import type { DeploymentAdapter, DeploymentContext, DeploymentResult } from '../types';

export const renderAdapter: DeploymentAdapter = {
  target: 'render',
  name: 'Render Web Services',

  generate(context: DeploymentContext): DeploymentResult {
    const { cwd, vistaDir, debug, deploymentConfig } = context;
    const generatedFiles: string[] = [];

    // Standalone server is the deployment artifact for Render
    const standaloneDir = path.join(vistaDir, 'standalone');

    // Generate render.yaml blueprint if enabled and not already present
    if (deploymentConfig.generateBlueprints && !fs.existsSync(path.join(cwd, 'render.yaml'))) {
      const blueprintFiles = this.generateBlueprint!(context);
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

  generateBlueprint(context: DeploymentContext): string[] {
    const { cwd, deploymentConfig } = context;
    const created: string[] = [];

    const renderYamlPath = path.join(cwd, 'render.yaml');
    if (!fs.existsSync(renderYamlPath)) {
      const pkgName = (() => {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
          return pkg.name?.replace(/[@/]/g, '-') || 'vista-app';
        } catch {
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

      fs.writeFileSync(renderYamlPath, renderYaml);
      created.push(renderYamlPath);
    }

    // Keep awake workflow blueprint (optional for free tier)
    const workflowPath = path.join(cwd, '.github', 'workflows', 'keep-render-awake.yml');
    if (!fs.existsSync(workflowPath) && fs.existsSync(path.join(cwd, '.github'))) {
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

      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      fs.writeFileSync(workflowPath, workflowContent);
      created.push(workflowPath);
    }

    return created;
  },
};
