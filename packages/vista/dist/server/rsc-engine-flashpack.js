"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRSCServer = void 0;
exports.startFlashpackRSCServer = startFlashpackRSCServer;
exports.default = startFlashpackRSCServer;
const runtime_1 = require("../flashpack/runtime");
const rsc_engine_1 = require("./rsc-engine");
function resolveMode() {
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}
function startFlashpackRSCServer(options = {}) {
    const cwd = process.cwd();
    const mode = resolveMode();
    const phase = mode === 'development' ? 'dev' : 'start';
    const strict = process.env.VISTA_FLASHPACK_STRICT !== 'false';
    const prepared = (0, runtime_1.prepareFlashpackRuntime)({
        cwd,
        phase,
        mode,
        allowFallback: !strict,
    });
    if (process.env.VISTA_DEBUG) {
        console.log(`[flashpack] server runtime prepared (rust=${prepared.rustPipelineUsed ? 'on' : 'fallback'}) at ${prepared.flashDir}`);
    }
    (0, rsc_engine_1.startRSCServer)(options);
}
exports.startRSCServer = startFlashpackRSCServer;
