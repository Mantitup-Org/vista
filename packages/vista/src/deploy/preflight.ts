import fs from 'fs';
import path from 'path';
import { resolveTypedApiConfig } from '../config';
import { validateVistaArtifacts } from '../server/artifact-validator';
import type { DeployContext } from './types';
import { readJsonSafe } from './utils';

interface RoutesManifest {
  dynamicRoutes?: Array<{ page?: string }>;
  staticRoutes?: Array<{ page?: string }>;
}

interface PrerenderManifest {
  routes?: Record<string, unknown>;
  dynamicRoutes?: Record<string, unknown>;
}

function hasDynamicOnlyRoutes(vistaDir: string): boolean {
  const routesManifest = readJsonSafe<RoutesManifest>(
    path.join(vistaDir, 'routes-manifest.json')
  );
  const prerenderManifest = readJsonSafe<PrerenderManifest>(
    path.join(vistaDir, 'prerender-manifest.json')
  );

  const dynamicCount = routesManifest?.dynamicRoutes?.length ?? 0;
  const staticCount = routesManifest?.staticRoutes?.length ?? 0;
  const prerenderedCount = Object.keys(prerenderManifest?.routes ?? {}).length;
  const dynamicPrerenderCount = Object.keys(prerenderManifest?.dynamicRoutes ?? {}).length;

  if (dynamicCount > 0 && staticCount === 0 && prerenderedCount === 0) {
    return true;
  }

  if (dynamicPrerenderCount > 0 && prerenderedCount === 0) {
    return true;
  }

  return false;
}

export function validateBuildArtifacts(ctx: DeployContext): string[] {
  const missing = validateVistaArtifacts(ctx.cwd, 'rsc');
  if (missing.length > 0) {
    return missing.map((entry) => `Missing build artifact: ${entry}`);
  }
  return [];
}

export async function runStaticHostPreflight(ctx: DeployContext): Promise<string[]> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const staticPagesDir = path.join(ctx.vistaDir, 'static', 'pages');
  if (!fs.existsSync(staticPagesDir)) {
    errors.push(
      'No pre-rendered pages found at .vista/static/pages. Static hosts require SSG output from "vista build".'
    );
  }

  if (hasDynamicOnlyRoutes(ctx.vistaDir)) {
    errors.push(
      'This app appears to rely on dynamic server rendering without static fallbacks. Deploy to Render or Docker for full runtime support.'
    );
  }

  const typedApi = resolveTypedApiConfig(ctx.config);
  if (typedApi.enabled) {
    errors.push(
      'Typed API is enabled. Static CDN hosts cannot run typed API runtime. Use deploy.target "render" or "docker".'
    );
  }

  const appApiDir = path.join(ctx.cwd, 'app', 'api');
  if (fs.existsSync(appApiDir)) {
    warnings.push(
      'Found app/api routes. Server-side API routes are not supported on static CDN deploy targets.'
    );
  }

  if (ctx.config.images && ctx.config.images.unoptimized !== true) {
    warnings.push(
      'Consider setting images.unoptimized: true in vista.config.ts for static hosts without /_vista/image optimization.'
    );
  }

  return [...errors, ...warnings.map((entry) => `warning:${entry}`)];
}

export async function runStandalonePreflight(ctx: DeployContext): Promise<string[]> {
  const errors: string[] = [];
  const standaloneServer = path.join(ctx.vistaDir, 'standalone', 'server.js');
  if (!fs.existsSync(standaloneServer)) {
    errors.push('Missing .vista/standalone/server.js. Run "vista build" before deploying to Node hosts.');
  }
  return errors;
}

export function splitPreflightMessages(messages: string[]): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const message of messages) {
    if (message.startsWith('warning:')) {
      warnings.push(message.slice('warning:'.length));
    } else {
      errors.push(message);
    }
  }

  return { errors, warnings };
}
