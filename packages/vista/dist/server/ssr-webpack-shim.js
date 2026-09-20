"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSSRWebpackShim = installSSRWebpackShim;
const url_1 = require("url");
/**
 * react-server-dom-webpack/client.node calls __webpack_require__ while decoding
 * Flight into a React tree. Vista SSR/SSG run in plain Node, so this shim maps
 * webpack specifiers (including file:// URLs) onto require().
 */
function installSSRWebpackShim() {
    if (typeof globalThis.__webpack_require__ === 'function') {
        return;
    }
    globalThis.__webpack_require__ = function ssrWebpackRequire(specifier) {
        let modulePath = specifier;
        if (specifier.startsWith('file://')) {
            try {
                modulePath = (0, url_1.fileURLToPath)(specifier);
            }
            catch {
                modulePath = specifier;
            }
        }
        return require(modulePath);
    };
    globalThis.__webpack_chunk_load__ = function ssrChunkLoad(_chunkId) {
        return Promise.resolve();
    };
}
