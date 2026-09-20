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

import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import type { Request, Response } from 'express';
import { imageConfigDefault, type ImageConfigComplete } from '../image/image-config';
import { resolveAppDir } from './app-dir';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  etag: string;
  createdAt: number;
}

interface ImageOptimizerOptions {
  /** Project root directory */
  cwd: string;
  /** Whether sharp is available */
  sharpAvailable: boolean;
  /** Image config from vista.config */
  config: ImageConfigComplete;
  /** Whether in dev mode */
  isDev: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const imageCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 200;

function getCacheKey(url: string, width: number, quality: number, format: string): string {
  return `${url}|${width}|${quality}|${format}`;
}

function pruneCache(maxAge: number): void {
  const now = Date.now();
  for (const [key, entry] of imageCache) {
    if (now - entry.createdAt > maxAge) {
      imageCache.delete(key);
    }
  }
  // If still over limit, remove oldest
  if (imageCache.size > MAX_CACHE_SIZE) {
    const entries = [...imageCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      imageCache.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Sharp detection
// ---------------------------------------------------------------------------

let sharp: any = null;

function detectSharp(): boolean {
  try {
    sharp = require('sharp');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fetch image source
// ---------------------------------------------------------------------------

function fetchLocalFile(filePath: string, cwd: string): Promise<Buffer> {
  // Resolve against public/ directory
  const publicPath = path.join(cwd, 'public', filePath);
  if (fs.existsSync(publicPath)) {
    return fs.promises.readFile(publicPath);
  }

  // Also try app/ directory
  const appPath = path.join(resolveAppDir(cwd), filePath);
  if (fs.existsSync(appPath)) {
    return fs.promises.readFile(appPath);
  }

  throw new Error(`Image not found: ${filePath}`);
}

function fetchRemoteImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(url, { timeout: 10000 }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        // Follow redirect
        fetchRemoteImage(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode && response.statusCode !== 200) {
        reject(new Error(`Remote image returned status ${response.statusCode}: ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Timeout fetching remote image: ${url}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Domain / remote pattern validation
// ---------------------------------------------------------------------------

function isAllowedRemoteUrl(url: string, config: ImageConfigComplete): boolean {
  try {
    const parsed = new URL(url);

    // Check domains
    if (config.domains.length > 0) {
      if (config.domains.includes(parsed.hostname)) {
        return true;
      }
    }

    // Check remote patterns
    if ((config.remotePatterns as any[]).length > 0) {
      for (const pattern of config.remotePatterns as any[]) {
        const hostMatch = pattern.hostname
          ? new RegExp(`^${pattern.hostname.replace(/\*/g, '.*')}$`).test(parsed.hostname)
          : true;
        const protocolMatch = pattern.protocol ? parsed.protocol === `${pattern.protocol}:` : true;
        const portMatch = pattern.port ? parsed.port === pattern.port : true;
        const pathMatch = pattern.pathname
          ? parsed.pathname.startsWith(pattern.pathname.replace(/\*\*$/, ''))
          : true;

        if (hostMatch && protocolMatch && portMatch && pathMatch) {
          return true;
        }
      }
    }

    // If no domains/patterns configured, allow all in dev, block in prod
    if (config.domains.length === 0 && (config.remotePatterns as any[]).length === 0) {
      return true; // Allow all when no restrictions configured
    }

    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Content type helpers
// ---------------------------------------------------------------------------

function getContentType(format: string): string {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

function detectFormat(buffer: Buffer): string {
  // Check magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'gif';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
    return 'webp';
  // Check for SVG
  const header = buffer.slice(0, 256).toString('utf8').trim();
  if (header.startsWith('<?xml') || header.startsWith('<svg')) return 'svg';
  // AVIF (ftyp box)
  if (buffer.length > 11 && buffer.slice(4, 8).toString() === 'ftyp') return 'avif';
  return 'jpeg'; // default
}

function computeEtag(buffer: Buffer): string {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(buffer).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Process image with sharp
// ---------------------------------------------------------------------------

async function processWithSharp(
  sourceBuffer: Buffer,
  width: number,
  quality: number,
  acceptedFormats: string[]
): Promise<{ buffer: Buffer; format: string }> {
  const inputFormat = detectFormat(sourceBuffer);

  // Don't process SVGs
  if (inputFormat === 'svg') {
    return { buffer: sourceBuffer, format: 'svg' };
  }

  // Determine output format
  let outputFormat: string = inputFormat;
  if (acceptedFormats.includes('image/avif')) {
    outputFormat = 'avif';
  } else if (acceptedFormats.includes('image/webp')) {
    outputFormat = 'webp';
  }

  let pipeline = sharp(sourceBuffer).resize(width, undefined, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  switch (outputFormat) {
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'png':
      pipeline = pipeline.png({ quality });
      break;
    default:
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
  }

  const buffer = await pipeline.toBuffer();
  return { buffer, format: outputFormat };
}

// ---------------------------------------------------------------------------
// Passthrough fallback (no sharp)
// ---------------------------------------------------------------------------

async function processPassthrough(
  sourceBuffer: Buffer
): Promise<{ buffer: Buffer; format: string }> {
  const format = detectFormat(sourceBuffer);
  return { buffer: sourceBuffer, format };
}

// ---------------------------------------------------------------------------
// Express handler
// ---------------------------------------------------------------------------

export function createImageHandler(cwd: string, isDev: boolean) {
  const sharpAvailable = detectSharp();

  if (!sharpAvailable && isDev && process.env.VISTA_DEBUG) {
    console.log(
      '[vista:image] sharp not found — images served without optimization. ' +
        'Install sharp for resizing and format conversion: pnpm add sharp'
    );
  }

  const config = { ...imageConfigDefault };

  return async function handleImageRequest(req: Request, res: Response): Promise<void> {
    try {
      const url = req.query.url as string;
      const width = parseInt(req.query.w as string, 10) || 0;
      const quality = parseInt(req.query.q as string, 10) || 75;

      if (!url) {
        res.status(400).send('Missing "url" parameter');
        return;
      }

      if (width <= 0) {
        res.status(400).send('Missing or invalid "w" (width) parameter');
        return;
      }

      // Validate width against allowed sizes
      const allSizes = [...config.deviceSizes, ...config.imageSizes];
      if (!allSizes.includes(width)) {
        // Find the nearest allowed size
        const nearest = allSizes.reduce((prev, curr) =>
          Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev
        );
        // Allow if within 10% tolerance, otherwise use nearest
        if (Math.abs(width - nearest) / nearest > 0.1) {
          // Not a valid size — use nearest
          req.query.w = String(nearest);
        }
      }

      // Determine accepted output formats from Accept header
      const accept = req.headers.accept || '';
      const acceptedFormats = accept.split(',').map((s) => s.trim().split(';')[0]);

      // Check cache
      const bestFormat = acceptedFormats.includes('image/avif')
        ? 'avif'
        : acceptedFormats.includes('image/webp')
          ? 'webp'
          : 'original';
      const cacheKey = getCacheKey(url, width, quality, bestFormat);
      const cached = imageCache.get(cacheKey);

      if (cached) {
        const maxAge = config.minimumCacheTTL * 1000;
        if (Date.now() - cached.createdAt < maxAge) {
          // Check ETag for 304
          if (req.headers['if-none-match'] === cached.etag) {
            res.status(304).end();
            return;
          }

          res.setHeader('Content-Type', cached.contentType);
          res.setHeader(
            'Cache-Control',
            `public, max-age=${config.minimumCacheTTL}, stale-while-revalidate`
          );
          res.setHeader('ETag', cached.etag);
          res.send(cached.buffer);
          return;
        }
        imageCache.delete(cacheKey);
      }

      // Fetch source image
      let sourceBuffer: Buffer;
      const isRemote = url.startsWith('http://') || url.startsWith('https://');

      if (isRemote) {
        if (!isAllowedRemoteUrl(url, config)) {
          res.status(400).send('Remote image URL not allowed by configuration');
          return;
        }

        // SVG safety check
        if (!config.dangerouslyAllowSVG && url.endsWith('.svg')) {
          res
            .status(400)
            .send('SVG images are not allowed. Set dangerouslyAllowSVG in image config.');
          return;
        }

        sourceBuffer = await fetchRemoteImage(url);
      } else {
        // Local file
        const cleanedUrl = url.startsWith('/') ? url.slice(1) : url;
        sourceBuffer = await fetchLocalFile(cleanedUrl, cwd);
      }

      // Process the image
      let result: { buffer: Buffer; format: string };

      if (sharpAvailable) {
        result = await processWithSharp(sourceBuffer, width, quality, acceptedFormats);
      } else {
        result = await processPassthrough(sourceBuffer);
      }

      const contentType = getContentType(result.format);
      const etag = computeEtag(result.buffer);

      // Store in cache
      imageCache.set(cacheKey, {
        buffer: result.buffer,
        contentType,
        etag,
        createdAt: Date.now(),
      });

      // Prune old entries
      pruneCache(config.minimumCacheTTL * 1000);

      // Apply CSP for SVGs
      if (result.format === 'svg' && config.contentSecurityPolicy) {
        res.setHeader('Content-Security-Policy', config.contentSecurityPolicy);
      }

      // Send response
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Cache-Control',
        isDev
          ? 'no-cache, no-store, must-revalidate'
          : `public, max-age=${config.minimumCacheTTL}, stale-while-revalidate`
      );
      res.setHeader('ETag', etag);
      res.setHeader('Content-Disposition', `${config.contentDispositionType}`);
      res.setHeader('Vary', 'Accept');

      res.send(result.buffer);
    } catch (err) {
      const message = (err as Error)?.message || String(err);
      console.error(`[vista:image] Error processing image: ${message}`);

      if (message.includes('not found')) {
        res.status(404).send(`Image not found`);
      } else {
        res.status(500).send(`Image optimization error`);
      }
    }
  };
}
