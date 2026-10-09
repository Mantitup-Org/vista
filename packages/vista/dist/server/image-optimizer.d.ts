/**
 * Vista Image Optimizer
 *
 * Server-side image processing endpoint that handles:
 * - Resizing to requested width
 * - Format conversion (WebP, AVIF)
 * - Quality adjustment
 * - In-memory caching with TTL
 * - Local file and remote URL support
 * - Domain/remote pattern validation
 *
 * Uses `sharp` when available for high-performance native processing.
 * Falls back to a passthrough proxy when sharp is not installed.
 */
import type { Request, Response } from 'express';
import type { ImageConfigComplete } from '../image/image-config';
export declare function createImageHandler(cwd: string, isDev: boolean, customConfig?: Partial<ImageConfigComplete>): (req: Request, res: Response) => Promise<void>;
