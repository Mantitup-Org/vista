"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFlashpackEngineCommand = runFlashpackEngineCommand;
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const build_rsc_1 = require("../bin/build-rsc");
const rsc_engine_1 = require("../server/rsc-engine");
const spawn_permissions_1 = require("../server/spawn-permissions");
const runtime_1 = require("./runtime");
function resolveMode(phase) {
    if (phase === 'dev') {
        return 'development';
    }
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}
function getRunnerPath() {
    return path_1.default.resolve(__dirname, '..', 'bin', 'flashpack-runner.js');
}
function formatRustFailure(message) {
    return `[flashpack] Rust command unavailable: ${message}`;
}
async function fallbackToCore(phase, port) {
    const normalizedPort = Number(port || process.env.PORT || 3003) || 3003;
    process.env.VISTA_ENGINE = 'flashpack';
    process.env.VISTA_ENGINE_VARIANT = 'flashpack';
    process.env.VISTA_FLASHPACK = 'true';
    process.env.VISTA_FLASHPACK_PIPELINE = 'js-fallback';
    if (phase === 'build') {
        await (0, build_rsc_1.buildRSC)(false);
        return;
    }
    if (phase === 'dev') {
        const result = await (0, build_rsc_1.buildRSC)(true);
        (0, rsc_engine_1.startRSCServer)({
            port: normalizedPort,
            compiler: result.clientCompiler,
        });
        return;
    }
    (0, rsc_engine_1.startRSCServer)({
        port: normalizedPort,
    });
}
async function runFlashpackEngineCommand(phase, options = {}) {
    const cwd = options.cwd || process.cwd();
    const strict = options.strict ?? process.env.VISTA_FLASHPACK_STRICT !== 'false';
    const mode = resolveMode(phase);
    const runnerPath = getRunnerPath();
    const port = options.port || process.env.PORT || 3003;
    const prepare = (0, runtime_1.runFlashpackRustCli)({
        cwd,
        phase: phase,
        mode,
        action: 'prepare',
    });
    if (prepare.error || prepare.status !== 0) {
        if (strict) {
            throw new Error(formatRustFailure(prepare.error || 'unknown failure'));
        }
        await fallbackToCore(phase, port);
        return;
    }
    const workspaceRoot = prepare.workspaceRoot;
    const cargoCommand = prepare.cargoCommand;
    if (!workspaceRoot || !cargoCommand) {
        if (strict) {
            throw new Error('[flashpack] Rust workspace unavailable for flashpack command.');
        }
        await fallbackToCore(phase, port);
        return;
    }
    await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(cargoCommand, [
            'run',
            '-q',
            '-p',
            'flashpack-cli',
            '--',
            '--cwd',
            cwd,
            '--phase',
            phase,
            '--mode',
            mode,
            '--action',
            'run',
            '--node',
            process.execPath,
            '--runner',
            runnerPath,
            '--port',
            String(port),
        ], {
            cwd: workspaceRoot,
            env: {
                ...process.env,
                VISTA_ENGINE: 'flashpack',
                VISTA_ENGINE_VARIANT: 'flashpack',
                VISTA_FLASHPACK: 'true',
                VISTA_FLASHPACK_PIPELINE: 'rust-cli',
            },
            stdio: 'inherit',
            windowsHide: true,
        });
        child.once('error', async (error) => {
            const message = (0, spawn_permissions_1.isPermissionDeniedSpawnError)(error)
                ? formatRustFailure(`spawn blocked by environment permissions (${(0, spawn_permissions_1.getErrorMessage)(error)})`)
                : formatRustFailure((0, spawn_permissions_1.getErrorMessage)(error));
            if (!strict) {
                try {
                    await fallbackToCore(phase, port);
                    resolve();
                    return;
                }
                catch (fallbackError) {
                    reject(fallbackError);
                    return;
                }
            }
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
