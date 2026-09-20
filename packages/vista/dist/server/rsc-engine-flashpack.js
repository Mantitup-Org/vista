"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRSCServer = void 0;
exports.createRSCApp = createRSCApp;
exports.startFlashpackRSCServer = startFlashpackRSCServer;
exports.default = startFlashpackRSCServer;
const runtime_1 = require("../flashpack/runtime");
const rsc_engine_1 = require("./rsc-engine");
function resolveMode() {
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}
function createRSCApp(options = {}) {
    return startFlashpackRSCServer({ ...options, listen: false });
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
    if (!prepared.rustPipelineUsed) {
        if (strict) {
            throw new Error('[flashpack] Rust pipeline did not run. Refusing to start Flight SSR without Flashpack prep (set VISTA_FLASHPACK_STRICT=false for an explicit non-Rust fallback).');
        }
        console.warn('[flashpack] WARNING: Rust pipeline skipped — serving via webpack Flight SSR fallback (not a silent renderToString path).');
    }
    if (process.env.VISTA_DEBUG) {
        console.log(`[flashpack] server runtime prepared (rust=${prepared.rustPipelineUsed ? 'on' : 'fallback'}) at ${prepared.flashDir}`);
    }
    // Same Flight SSR contract as webpack: inline Flight, React.use streaming, fail-closed.
    return (0, rsc_engine_1.startRSCServer)(options);
}
exports.startRSCServer = startFlashpackRSCServer;
