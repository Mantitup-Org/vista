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
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapters = exports.dockerAdapter = exports.renderAdapter = exports.cloudflareAdapter = exports.vercelAdapter = exports.nodeAdapter = void 0;
exports.getAdapter = getAdapter;
const node_1 = require("./node");
const vercel_1 = require("./vercel");
const cloudflare_1 = require("./cloudflare");
const render_1 = require("./render");
const docker_1 = require("./docker");
__exportStar(require("./types"), exports);
var node_2 = require("./node");
Object.defineProperty(exports, "nodeAdapter", { enumerable: true, get: function () { return node_2.nodeAdapter; } });
var vercel_2 = require("./vercel");
Object.defineProperty(exports, "vercelAdapter", { enumerable: true, get: function () { return vercel_2.vercelAdapter; } });
var cloudflare_2 = require("./cloudflare");
Object.defineProperty(exports, "cloudflareAdapter", { enumerable: true, get: function () { return cloudflare_2.cloudflareAdapter; } });
var render_2 = require("./render");
Object.defineProperty(exports, "renderAdapter", { enumerable: true, get: function () { return render_2.renderAdapter; } });
var docker_2 = require("./docker");
Object.defineProperty(exports, "dockerAdapter", { enumerable: true, get: function () { return docker_2.dockerAdapter; } });
exports.adapters = {
    node: node_1.nodeAdapter,
    standalone: node_1.nodeAdapter,
    vercel: vercel_1.vercelAdapter,
    cloudflare: cloudflare_1.cloudflareAdapter,
    'cloudflare-workers': cloudflare_1.cloudflareAdapter,
    render: render_1.renderAdapter,
    docker: docker_1.dockerAdapter,
};
function getAdapter(name) {
    return exports.adapters[name.toLowerCase()];
}
