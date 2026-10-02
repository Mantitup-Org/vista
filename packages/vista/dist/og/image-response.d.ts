/**
 * ImageResponse — Next/Astro-compatible OG image generation via Satori + resvg.
 */
import type { ReactElement } from 'react';
export type ImageResponseOptions = {
    width?: number;
    height?: number;
    status?: number;
    statusText?: string;
    headers?: HeadersInit;
    fonts?: Array<{
        name: string;
        data: ArrayBuffer | Buffer;
        weight?: number;
        style?: 'normal' | 'italic';
    }>;
    debug?: boolean;
};
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
export declare class ImageResponse extends Response {
    constructor(element: ReactElement, options?: ImageResponseOptions);
}
