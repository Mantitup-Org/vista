import { fileURLToPath } from 'url';

/**
 * react-server-dom-webpack/client.node calls __webpack_require__ while decoding
 * Flight into a React tree. Vista SSR/SSG run in plain Node, so this shim maps
 * webpack specifiers (including file:// URLs) onto require().
 */
export function installSSRWebpackShim(): void {
  if (typeof (globalThis as { __webpack_require__?: unknown }).__webpack_require__ === 'function') {
    return;
  }

  (globalThis as any).__webpack_require__ = function ssrWebpackRequire(specifier: string): unknown {
    let modulePath = specifier;
    if (specifier.startsWith('file://')) {
      try {
        modulePath = fileURLToPath(specifier);
      } catch {
        modulePath = specifier;
      }
    }
    return require(modulePath);
  };

  (globalThis as any).__webpack_chunk_load__ = function ssrChunkLoad(_chunkId: string): Promise<void> {
    return Promise.resolve();
  };
}
