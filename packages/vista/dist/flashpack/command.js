"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFlashpackEngineCommand = runFlashpackEngineCommand;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const module_1 = require("module");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const dev_client_runtime_1 = require("../bin/dev-client-runtime");
const spawn_permissions_1 = require("../server/spawn-permissions");
const runtime_1 = require("./runtime");
function resolveMode(phase) {
    if (phase === 'dev') {
        return 'development';
    }
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}
function formatRustFailure(message) {
    return `[flashpack] Rust command unavailable: ${message}`;
}
function vistaVersion() {
    try {
        const require = (0, module_1.createRequire)(__filename);
        const pkg = require('../../package.json');
        return pkg.version || '0.3.9';
    }
    catch {
        return '0.3.9';
    }
}
function installDevClient(cwd) {
    const file = path_1.default.join(cwd, '.flash', 'dev', 'vista-dev.js');
    fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
    fs_1.default.writeFileSync(file, (0, dev_client_runtime_1.getSharedDevClientSource)(String(Date.now())));
}
function networkHost() {
    const interfaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal)
                return iface.address;
        }
    }
    return '';
}
async function runFlashpackEngineCommand(phase, options = {}) {
    const cwd = options.cwd || process.cwd();
    const mode = resolveMode(phase);
    const port = options.port || process.env.PORT || 3003;
    const action = options.action || 'run';
    const launch = (0, runtime_1.resolveFlashpackLaunch)(cwd);
    const ssrRunner = action === 'run' ? (0, runtime_1.resolveFlashpackSsrRunner)(cwd) : null;
    if (action === 'run') {
        installDevClient(cwd);
    }
    await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(launch.command, [
            ...launch.args,
            '--cwd',
            cwd,
            '--phase',
            phase,
            '--mode',
            mode,
            '--action',
            action,
            ...(action === 'run' ? ['--port', String(port)] : []),
            ...(ssrRunner ? ['--ssr-runner', ssrRunner] : []),
        ], {
            cwd: launch.cwd,
            env: {
                ...process.env,
                VISTA_ENGINE: 'flashpack',
                VISTA_ENGINE_VARIANT: 'flashpack',
                VISTA_FLASHPACK: 'true',
                VISTA_FLASHPACK_PIPELINE: 'rust-swc',
                VISTA_VERSION: vistaVersion(),
                VISTA_NETWORK_HOST: networkHost(),
            },
            stdio: 'inherit',
            windowsHide: true,
        });
        child.once('error', (error) => {
            const message = (0, spawn_permissions_1.isPermissionDeniedSpawnError)(error)
                ? formatRustFailure(`spawn blocked by environment permissions (${(0, spawn_permissions_1.getErrorMessage)(error)})`)
                : formatRustFailure((0, spawn_permissions_1.getErrorMessage)(error));
            reject(new Error(message));
        });
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`[flashpack] Rust command failed for ${phase} (code=${code}, signal=${signal || 'none'})`));
        });
    });
}
exports.default = runFlashpackEngineCommand;
