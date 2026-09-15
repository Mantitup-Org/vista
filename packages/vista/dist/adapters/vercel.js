"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelAdapter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs_1.default.existsSync(sourceDir))
        return;
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs_1.default.readdirSync(sourceDir, { withFileTypes: true })) {
        const from = path_1.default.join(sourceDir, entry.name);
        const to = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(from, to);
        }
        else if (entry.isFile()) {
            fs_1.default.copyFileSync(from, to);
        }
    }
}
exports.vercelAdapter = {
    name: 'vercel',
    description: 'Vercel Serverless and Build Output API v3 adapter',
    build(context) {
        const { cwd, vistaDir, debug } = context;
        const vercelOutputDir = path_1.default.join(cwd, '.vercel', 'output');
        const vercelStaticDir = path_1.default.join(vercelOutputDir, 'static');
        fs_1.default.rmSync(vercelOutputDir, { recursive: true, force: true });
        fs_1.default.mkdirSync(vercelStaticDir, { recursive: true });
        // Public assets & static output
        copyDirectoryRecursive(path_1.default.join(cwd, 'public'), vercelStaticDir);
        copyDirectoryRecursive(path_1.default.join(vistaDir, 'static'), path_1.default.join(vercelStaticDir, 'static'));
        const clientCssPath = path_1.default.join(vistaDir, 'client.css');
        if (fs_1.default.existsSync(clientCssPath)) {
            fs_1.default.copyFileSync(clientCssPath, path_1.default.join(vercelStaticDir, 'client.css'));
            fs_1.default.copyFileSync(clientCssPath, path_1.default.join(vercelStaticDir, 'styles.css'));
        }
        const config = {
            version: 3,
            routes: [
                { handle: 'filesystem' },
                { src: '^/_vista/(.*)$', dest: '/$1' },
                { src: '^/(?:rsc|_rsc)/?$', dest: '/static/pages/index.rsc' },
                { src: '^/(?:rsc|_rsc)/(.+)$', dest: '/static/pages/$1.rsc' },
                { src: '^/$', dest: '/static/pages/index.html' },
                { src: '^/(.+)$', dest: '/static/pages/$1.html' },
            ],
        };
        fs_1.default.writeFileSync(path_1.default.join(vercelOutputDir, 'config.json'), JSON.stringify(config, null, 2));
        if (debug) {
            console.log('[vista:deploy] Generated Vercel Build Output v3 at .vercel/output/');
        }
    },
};
