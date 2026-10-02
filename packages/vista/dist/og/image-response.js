"use strict";
/**
 * ImageResponse — Next/Astro-compatible OG image generation via Satori + resvg.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageResponse = void 0;
async function loadSatori() {
    const mod = await import('satori');
    return mod.default || mod;
}
async function renderSvgToPng(svg) {
    const resvgMod = await import('@resvg/resvg-wasm');
    const { Resvg, initWasm } = resvgMod;
    if (typeof initWasm === 'function') {
        try {
            // Prefer bundled wasm; fall back silently if already initialized.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const wasmUrl = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
            const fs = await import('fs');
            const wasm = fs.readFileSync(wasmUrl);
            await initWasm(wasm);
        }
        catch {
            try {
                await initWasm();
            }
            catch {
                // Already initialized in this process.
            }
        }
    }
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'original' },
    });
    const pngData = resvg.render();
    return pngData.asPng();
}
/**
 * Generate a PNG Response from a JSX tree (Satori subset of CSS).
 *
 * @example
 * ```tsx
 * import { ImageResponse } from 'vista/og'
 *
 * export default function OpenGraphImage() {
 *   return new ImageResponse(
 *     <div style={{ fontSize: 64, background: '#111', color: 'white', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 *       Vista
 *     </div>,
 *     { width: 1200, height: 630 }
 *   )
 * }
 * ```
 */
class ImageResponse extends Response {
    constructor(element, options = {}) {
        const width = options.width ?? 1200;
        const height = options.height ?? 630;
        const status = options.status ?? 200;
        const statusText = options.statusText;
        const headers = new Headers(options.headers);
        headers.set('Content-Type', 'image/png');
        if (!headers.has('Cache-Control')) {
            headers.set('Cache-Control', 'public, immutable, no-transform, max-age=31536000');
        }
        const body = new ReadableStream({
            async start(controller) {
                try {
                    const satori = await loadSatori();
                    const svg = await satori(element, {
                        width,
                        height,
                        fonts: options.fonts,
                        embedFont: true,
                    });
                    const png = await renderSvgToPng(svg);
                    controller.enqueue(png);
                    controller.close();
                }
                catch (error) {
                    controller.error(error);
                }
            },
        });
        super(body, { status, statusText, headers });
    }
}
exports.ImageResponse = ImageResponse;
