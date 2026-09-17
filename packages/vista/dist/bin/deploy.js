"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeployCommand = runDeployCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const deploy_1 = require("../deploy");
function getFlagValue(flags, flag) {
    const index = flags.indexOf(flag);
    if (index !== -1) {
        const next = flags[index + 1];
        if (next && !next.startsWith('-'))
            return next;
    }
    const inline = flags.find((value) => value.startsWith(`${flag}=`));
    if (inline)
        return inline.slice(flag.length + 1);
    return undefined;
}
function printHelp() {
    console.log('');
    console.log('Usage: vista deploy [options]');
    console.log('');
    console.log('Options:');
    console.log('  --target <auto|render|vercel|cloudflare|netlify|docker>');
    console.log('  --prod                 Production deploy (default)');
    console.log('  --preview              Preview/staging deploy');
    console.log('  --dry-run              Build + emit + validate only');
    console.log('  --skip-build           Use existing .vista artifacts');
    console.log('  --force                Overwrite generated platform configs');
    console.log('  --help                 Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  vista deploy');
    console.log('  vista deploy --target vercel --prod');
    console.log('  vista deploy --target render --dry-run');
    console.log('');
}
async function runProductionBuild(cwd) {
    const vistaBin = path_1.default.join(__dirname, '..', '..', 'bin', 'vista.js');
    const result = (0, child_process_1.spawnSync)(process.execPath, [vistaBin, 'build'], {
        cwd,
        env: process.env,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        throw new Error('[vista:deploy] Production build failed.');
    }
}
async function runDeployCommand(flags, options = {}) {
    if (flags.includes('--help') || flags.includes('-h')) {
        printHelp();
        return 0;
    }
    const target = getFlagValue(flags, '--target');
    if (target === 'auto') {
        (options.error ?? console.error)('[vista:deploy] --target auto cannot be passed explicitly. Omit --target to auto-detect.');
        return 1;
    }
    if (target && !(0, deploy_1.listKnownTargets)().includes(target)) {
        (options.error ?? console.error)(`[vista:deploy] Unsupported target "${target}". Use one of: ${(0, deploy_1.listKnownTargets)().join(', ')}`);
        return 1;
    }
    const cwd = options.cwd ?? process.cwd();
    const dryRun = flags.includes('--dry-run');
    const skipBuild = flags.includes('--skip-build');
    const force = flags.includes('--force');
    const preview = flags.includes('--preview');
    const prod = !preview;
    if (!skipBuild && !fs_1.default.existsSync(path_1.default.join(cwd, 'package.json'))) {
        (options.error ?? console.error)('[vista:deploy] No package.json found in project root.');
        return 1;
    }
    try {
        const result = await (0, deploy_1.runDeploy)({
            cwd,
            target,
            dryRun,
            skipBuild,
            prod,
            preview,
            force,
            debug: Boolean(process.env.VISTA_DEBUG),
            log: options.log,
            warn: options.warn,
            error: options.error,
            build: runProductionBuild,
        });
        if (result.status === 'failed') {
            return 1;
        }
        return 0;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        (options.error ?? console.error)(message);
        return 1;
    }
}
