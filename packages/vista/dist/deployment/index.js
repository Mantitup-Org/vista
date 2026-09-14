"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeAdapter = exports.dockerAdapter = exports.renderAdapter = exports.cloudflareAdapter = exports.vercelAdapter = void 0;
exports.getDeploymentAdapter = getDeploymentAdapter;
exports.getAllDeploymentAdapters = getAllDeploymentAdapters;
const vercel_1 = require("./adapters/vercel");
const cloudflare_1 = require("./adapters/cloudflare");
const render_1 = require("./adapters/render");
const docker_1 = require("./adapters/docker");
const path_1 = __importDefault(require("path"));
__exportStar(require("./types"), exports);
__exportStar(require("./detector"), exports);
var vercel_2 = require("./adapters/vercel");
Object.defineProperty(exports, "vercelAdapter", { enumerable: true, get: function () { return vercel_2.vercelAdapter; } });
var cloudflare_2 = require("./adapters/cloudflare");
Object.defineProperty(exports, "cloudflareAdapter", { enumerable: true, get: function () { return cloudflare_2.cloudflareAdapter; } });
var render_2 = require("./adapters/render");
Object.defineProperty(exports, "renderAdapter", { enumerable: true, get: function () { return render_2.renderAdapter; } });
var docker_2 = require("./adapters/docker");
Object.defineProperty(exports, "dockerAdapter", { enumerable: true, get: function () { return docker_2.dockerAdapter; } });
exports.nodeAdapter = {
    target: 'node',
    name: 'Node.js Standalone Server',
    generate(context) {
        const { vistaDir, debug } = context;
        const standaloneDir = path_1.default.join(vistaDir, 'standalone');
        if (debug) {
            console.log(`[vista:deploy:node] Standalone server directory prepared at ${standaloneDir}`);
        }
        return {
            target: 'node',
            success: true,
            outputDirectory: standaloneDir,
            generatedFiles: [],
            notes: [
                'Node.js standalone server ready.',
                'Run in production with: node .vista/standalone/server.js',
            ],
        };
    },
};
const adapters = {
    vercel: vercel_1.vercelAdapter,
    cloudflare: cloudflare_1.cloudflareAdapter,
    render: render_1.renderAdapter,
    docker: docker_1.dockerAdapter,
    node: exports.nodeAdapter,
};
function getDeploymentAdapter(target) {
    if (target === 'auto')
        return null;
    return adapters[target] || null;
}
function getAllDeploymentAdapters() {
    return Object.values(adapters);
}
