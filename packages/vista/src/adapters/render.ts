import fs from 'fs';
import path from 'path';
import type { DeploymentAdapter, DeploymentContext } from './types';

export const renderAdapter: DeploymentAdapter = {
  name: 'render',
  description: 'Render.com zero-config blueprint adapter',
  build(context: DeploymentContext): void {
    const { cwd, debug } = context;
    const renderYamlPath = path.join(cwd, 'render.yaml');

    if (!fs.existsSync(renderYamlPath)) {
      const renderConfig = `services:
  - type: web
    name: vista-app
    runtime: node
    buildCommand: npm install && npx vista build
    startCommand: node .vista/standalone/server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
`;
      fs.writeFileSync(renderYamlPath, renderConfig);
      if (debug) {
        console.log('[vista:deploy] Generated render.yaml for Render deployment');
      }
    }
  },
};
