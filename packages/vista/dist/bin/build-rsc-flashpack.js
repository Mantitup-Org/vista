"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRSC = void 0;
exports.buildRSCFlashpack = buildRSCFlashpack;
const build_rsc_1 = require("./build-rsc");
const runtime_1 = require("../flashpack/runtime");
function resolveMode(watch) {
    if (watch)
        return 'development';
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}
async function buildRSCFlashpack(watch = false) {
    const cwd = process.cwd();
    const mode = resolveMode(watch);
    const strict = process.env.VISTA_FLASHPACK_STRICT !== 'false';
    const phase = watch ? 'dev' : 'build';
    const prepared = (0, runtime_1.prepareFlashpackRuntime)({
        cwd,
        phase,
        mode,
        allowFallback: !strict,
    });
    if (process.env.VISTA_DEBUG) {
        console.log(`[flashpack] runtime prepared (rust=${prepared.rustPipelineUsed ? 'on' : 'fallback'}) at ${prepared.flashDir}`);
    }
    return (0, build_rsc_1.buildRSC)(watch);
}
exports.buildRSC = buildRSCFlashpack;
exports.default = buildRSCFlashpack;
