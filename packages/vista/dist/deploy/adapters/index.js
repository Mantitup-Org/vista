"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelAdapter = exports.renderAdapter = exports.netlifyAdapter = exports.dockerAdapter = exports.cloudflareAdapter = exports.deployAdapters = void 0;
exports.getDeployAdapter = getDeployAdapter;
const cloudflare_1 = require("./cloudflare");
Object.defineProperty(exports, "cloudflareAdapter", { enumerable: true, get: function () { return cloudflare_1.cloudflareAdapter; } });
const docker_1 = require("./docker");
Object.defineProperty(exports, "dockerAdapter", { enumerable: true, get: function () { return docker_1.dockerAdapter; } });
const netlify_1 = require("./netlify");
Object.defineProperty(exports, "netlifyAdapter", { enumerable: true, get: function () { return netlify_1.netlifyAdapter; } });
const render_1 = require("./render");
Object.defineProperty(exports, "renderAdapter", { enumerable: true, get: function () { return render_1.renderAdapter; } });
const vercel_1 = require("./vercel");
Object.defineProperty(exports, "vercelAdapter", { enumerable: true, get: function () { return vercel_1.vercelAdapter; } });
exports.deployAdapters = {
    render: render_1.renderAdapter,
    vercel: vercel_1.vercelAdapter,
    cloudflare: cloudflare_1.cloudflareAdapter,
    netlify: netlify_1.netlifyAdapter,
    docker: docker_1.dockerAdapter,
};
function getDeployAdapter(target) {
    return exports.deployAdapters[target];
}
