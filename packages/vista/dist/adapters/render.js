"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.renderAdapter = {
    name: 'render',
    description: 'Render.com zero-config blueprint adapter',
    build(context) {
        const { cwd, debug } = context;
        const renderYamlPath = path_1.default.join(cwd, 'render.yaml');
        if (!fs_1.default.existsSync(renderYamlPath)) {
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
            fs_1.default.writeFileSync(renderYamlPath, renderConfig);
            if (debug) {
                console.log('[vista:deploy] Generated render.yaml for Render deployment');
            }
        }
    },
};
