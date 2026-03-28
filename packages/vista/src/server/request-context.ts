import { AsyncLocalStorage } from 'node:async_hooks';
import type express from 'express';
import type { ResolvedSegmentConfig } from './segment-config';

export interface RequestContext {
  req?: express.Request;
  res?: express.Response;
  cwd?: string;
  vistaDirRoot?: string;
  urlPath?: string;
  segmentConfig?: ResolvedSegmentConfig;
  usedTags: Set<string>;
  revalidatedTags: Set<string>;
  revalidatedPaths: Set<string>;
}

export interface RequestContextSeed {
  req?: express.Request;
  res?: express.Response;
  cwd?: string;
  vistaDirRoot?: string;
  urlPath?: string;
  segmentConfig?: ResolvedSegmentConfig;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

function createRequestContext(seed: RequestContextSeed = {}): RequestContext {
  return {
    req: seed.req,
    res: seed.res,
    cwd: seed.cwd,
    vistaDirRoot: seed.vistaDirRoot,
    urlPath: seed.urlPath,
    segmentConfig: seed.segmentConfig,
    usedTags: new Set<string>(),
    revalidatedTags: new Set<string>(),
    revalidatedPaths: new Set<string>(),
  };
}

export function runWithRequestContext<T>(
  seed: RequestContextSeed,
  callback: () => T
): T {
  return requestContextStorage.run(createRequestContext(seed), callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function setCurrentSegmentConfig(segmentConfig: ResolvedSegmentConfig | undefined): void {
  const context = getRequestContext();
  if (context) {
    context.segmentConfig = segmentConfig;
  }
}

export function getCurrentSegmentConfig(): ResolvedSegmentConfig | undefined {
  return getRequestContext()?.segmentConfig;
}

export function trackCacheTags(tags: Iterable<string> | undefined): void {
  const context = getRequestContext();
  if (!context || !tags) {
    return;
  }

  for (const tag of tags) {
    const normalized = String(tag || '').trim();
    if (normalized) {
      context.usedTags.add(normalized);
    }
  }
}

export function consumeTrackedTags(): string[] {
  const context = getRequestContext();
  if (!context || context.usedTags.size === 0) {
    return [];
  }

  const tags = Array.from(context.usedTags);
  context.usedTags.clear();
  return tags;
}

export function consumeRevalidatedTags(): string[] {
  const context = getRequestContext();
  if (!context || context.revalidatedTags.size === 0) {
    return [];
  }

  const tags = Array.from(context.revalidatedTags);
  context.revalidatedTags.clear();
  return tags;
}

export function consumeRevalidatedPaths(): string[] {
  const context = getRequestContext();
  if (!context || context.revalidatedPaths.size === 0) {
    return [];
  }

  const paths = Array.from(context.revalidatedPaths);
  context.revalidatedPaths.clear();
  return paths;
}

export function recordRevalidatedTag(tag: string): void {
  const context = getRequestContext();
  const normalized = String(tag || '').trim();
  if (context && normalized) {
    context.revalidatedTags.add(normalized);
  }
}

export function recordRevalidatedPath(urlPath: string): void {
  const context = getRequestContext();
  const normalized = String(urlPath || '').trim();
  if (context && normalized) {
    context.revalidatedPaths.add(normalized);
  }
}
