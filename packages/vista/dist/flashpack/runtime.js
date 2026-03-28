"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findFlashpackWorkspaceRoot = findFlashpackWorkspaceRoot;
exports.bootstrapFlashDirectories = bootstrapFlashDirectories;
exports.resolveCargoCommand = resolveCargoCommand;
exports.runFlashpackRustCli = runFlashpackRustCli;
exports.prepareFlashpackRuntime = prepareFlashpackRuntime;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const constants_1 = require("../constants");
const native_scanner_1 = require("../build/rsc/native-scanner");
function ensureDir(absolutePath) {
    fs_1.default.mkdirSync(absolutePath, { recursive: true });
}
function writeJsonFile(absolutePath, payload) {
    ensureDir(path_1.default.dirname(absolutePath));
    fs_1.default.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
}
function removeLegacyFlashArtifacts(cwd, flashDir) {
    for (const legacyPath of [
        path_1.default.join(cwd, '.turbo'),
        path_1.default.join(flashDir, 'cache', 'turbo'),
        path_1.default.join(flashDir, 'turbo'),
    ]) {
        if (!fs_1.default.existsSync(legacyPath)) {
            continue;
        }
        fs_1.default.rmSync(legacyPath, { recursive: true, force: true });
    }
}
function findFlashpackWorkspaceRoot(startCwd) {
    let current = path_1.default.resolve(startCwd);
    while (true) {
        const candidate = path_1.default.join(current, 'flashpack', 'xtask', 'Cargo.toml');
        if (fs_1.default.existsSync(candidate)) {
            return current;
        }
        const parent = path_1.default.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function bootstrapFlashDirectories(cwd) {
    const flashDir = path_1.default.join(cwd, constants_1.FLASH_DIR);
    removeLegacyFlashArtifacts(cwd, flashDir);
    const dirs = [
        flashDir,
        path_1.default.join(flashDir, 'graph'),
        path_1.default.join(flashDir, 'logs'),
        path_1.default.join(flashDir, 'runtime'),
        path_1.default.join(flashDir, 'state'),
    ];
    dirs.forEach(ensureDir);
    return flashDir;
}
function resolveCargoCommand() {
    if (process.env.CARGO && process.env.CARGO.trim().length > 0) {
        return process.env.CARGO.trim();
    }
    if (process.platform === 'win32') {
        const whereResult = (0, child_process_1.spawnSync)('where.exe', ['cargo'], {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        if (whereResult.status === 0) {
            const first = String(whereResult.stdout || '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find((line) => line.length > 0);
            if (first)
                return first;
        }
        return 'cargo.exe';
    }
    const whichResult = (0, child_process_1.spawnSync)('which', ['cargo'], {
        encoding: 'utf-8',
        stdio: 'pipe',
    });
    if (whichResult.status === 0) {
        const first = String(whichResult.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line.length > 0);
        if (first)
            return first;
    }
    return 'cargo';
}
function buildRustCliArgs(options, graphPath) {
    const args = [
        'run',
        '-q',
        '-p',
        'flashpack-cli',
        '--',
        '--cwd',
        options.cwd,
        '--phase',
        options.phase,
        '--mode',
        options.mode,
        '--action',
        options.action || 'prepare',
    ];
    if (options.runnerPath) {
        args.push('--runner', options.runnerPath);
    }
    if (options.nodeCommand) {
        args.push('--node', options.nodeCommand);
    }
    if (options.port !== undefined && options.port !== null && String(options.port).trim().length > 0) {
        args.push('--port', String(options.port));
    }
    return args;
}
function runFlashpackRustCli(options) {
    const flashDir = bootstrapFlashDirectories(options.cwd);
    const workspaceRoot = findFlashpackWorkspaceRoot(options.cwd);
    const graphPath = path_1.default.join(flashDir, 'graph', `${options.phase}-rust.json`);
    const runtimeManifestPath = path_1.default.join(flashDir, 'runtime', `${options.phase}-manifest.json`);
    const logPath = path_1.default.join(flashDir, 'logs', `${options.phase}-cli.log`);
    if (!workspaceRoot) {
        return {
            flashDir,
            workspaceRoot: null,
            cargoCommand: null,
            args: [],
            logPath,
            graphPath,
            runtimeManifestPath,
            error: `Rust workspace not found from ${options.cwd}. Expected flashpack/xtask/Cargo.toml in an ancestor directory.`,
            status: null,
        };
    }
    const cargoCommand = resolveCargoCommand();
    const args = buildRustCliArgs(options, graphPath);
    const result = (0, child_process_1.spawnSync)(cargoCommand, args, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
    });
    const log = [
        `[flashpack] workspace=${workspaceRoot}`,
        `[flashpack] command=${cargoCommand} ${args.join(' ')}`,
        `[flashpack] status=${result.status ?? 'null'}`,
        `[flashpack] error=${result.error ? result.error.message : ''}`,
        '[flashpack] stdout:',
        result.stdout || '',
        '[flashpack] stderr:',
        result.stderr || '',
    ].join('\n');
    fs_1.default.writeFileSync(logPath, log);
    return {
        flashDir,
        workspaceRoot,
        cargoCommand,
        args,
        logPath,
        graphPath,
        runtimeManifestPath,
        error: result.error
            ? result.error.message
            : result.status === 0
                ? undefined
                : (result.stderr || result.stdout || 'unknown cargo failure').trim(),
        status: result.status ?? null,
    };
}
function prepareFlashpackRuntime(options) {
    const { cwd, phase, mode, allowFallback = true } = options;
    const flashDir = bootstrapFlashDirectories(cwd);
    const now = new Date().toISOString();
    const graphPath = path_1.default.join(flashDir, 'graph', `${phase}.json`);
    writeJsonFile(path_1.default.join(flashDir, 'state', 'latest.json'), {
        engine: 'flashpack',
        phase,
        mode,
        timestamp: now,
        cwd,
    });
    writeJsonFile(graphPath, {
        engine: 'flashpack',
        phase,
        mode,
        generatedBy: 'vista-ts-bootstrap',
        timestamp: now,
    });
    const appDir = path_1.default.join(cwd, 'app');
    if ((0, native_scanner_1.isNativeAvailable)() && fs_1.default.existsSync(appDir)) {
        const nativeScan = (0, native_scanner_1.scanAppNative)(appDir);
        if (nativeScan) {
            const nativeGraphPath = path_1.default.join(flashDir, 'graph', `${phase}-rust.json`);
            writeJsonFile(nativeGraphPath, {
                engine: 'flashpack',
                pipeline: 'rust-napi',
                phase,
                mode,
                timestamp: now,
                appDir,
                stats: {
                    totalFiles: nativeScan.totalFiles,
                    scanTimeMs: nativeScan.scanTimeMs,
                    clientComponents: nativeScan.clientComponents.length,
                    serverComponents: nativeScan.serverComponents.length,
                    pages: nativeScan.pages.length,
                    layouts: nativeScan.layouts.length,
                    apiRoutes: nativeScan.apiRoutes.length,
                    errors: nativeScan.errors.length,
                },
            });
            return {
                flashDir,
                rustPipelineUsed: true,
                workspaceRoot: null,
                graphPath: nativeGraphPath,
            };
        }
    }
    const rustResult = runFlashpackRustCli({
        cwd,
        phase,
        mode,
        action: 'prepare',
    });
    if (rustResult.error || rustResult.status !== 0) {
        const detail = rustResult.error || 'unknown cargo failure';
        if (!allowFallback) {
            throw new Error(`[flashpack] Rust pipeline failed: ${detail}`);
        }
        return {
            flashDir,
            rustPipelineUsed: false,
            workspaceRoot: rustResult.workspaceRoot,
            graphPath,
        };
    }
    return {
        flashDir,
        rustPipelineUsed: true,
        workspaceRoot: rustResult.workspaceRoot,
        graphPath: rustResult.graphPath,
    };
}
