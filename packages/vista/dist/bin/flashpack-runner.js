"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const build_rsc_1 = require("./build-rsc");
const rsc_engine_1 = require("../server/rsc-engine");
function parseCliArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return undefined;
    return process.argv[index + 1];
}
function normalizePhase(raw) {
    const value = String(raw || '')
        .trim()
        .toLowerCase();
    if (value === 'dev' || value === 'development')
        return 'dev';
    if (value === 'start')
        return 'start';
    return 'build';
}
async function main() {
    const phase = normalizePhase(parseCliArg('--phase'));
    const rawPort = parseCliArg('--port') || process.env.PORT || '3003';
    const port = Number(rawPort) || 3003;
    process.env.VISTA_ENGINE = 'flashpack';
    process.env.VISTA_ENGINE_VARIANT = 'flashpack';
    process.env.VISTA_FLASHPACK = 'true';
    process.env.VISTA_FLASHPACK_PIPELINE = process.env.VISTA_FLASHPACK_PIPELINE || 'rust-cli';
    if (phase === 'build') {
        await (0, build_rsc_1.buildRSC)(false);
        return;
    }
    if (phase === 'dev') {
        const buildResult = await (0, build_rsc_1.buildRSC)(true);
        (0, rsc_engine_1.startRSCServer)({
            port,
            compiler: buildResult.clientCompiler,
        });
        return;
    }
    const standaloneServerPath = path_1.default.join(process.cwd(), '.vista', 'standalone', 'server.js');
    if (fs_1.default.existsSync(standaloneServerPath)) {
        const standalone = require(standaloneServerPath);
        const startStandaloneServer = standalone.startStandaloneServer || standalone.default || standalone;
        startStandaloneServer({
            port,
            engine: 'flashpack',
        });
        return;
    }
    (0, rsc_engine_1.startRSCServer)({ port });
}
main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
