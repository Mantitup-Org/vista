import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'node:async_hooks';

import { invalidateCachedPage, invalidateCachedPagesByTag } from './static-cache';
import {
  getRequestContext,
  recordRevalidatedPath,
  recordRevalidatedTag,
  trackCacheTags,
} from './request-context';

export interface CacheLifeOptions {
  revalidate?: number | false;
  tags?: string[];
}

interface FunctionCacheEntry {
  createdAt: number;
  revalidate: number | false;
  tags: string[];
  value: unknown;
}

interface UseCacheEntry {
  createdAt: number;
  revalidate: number | false;
  tags: string[];
  value: unknown;
}

interface UseCacheInvocationState {
  revalidate: number | false;
  tags: Set<string>;
}

const functionCache = new Map<string, FunctionCacheEntry>();
const useCacheEntries = new Map<string, UseCacheEntry>();
const tagToFunctionKeys = new Map<string, Set<string>>();
const tagToUseCacheKeys = new Map<string, Set<string>>();
const useCacheScope = new AsyncLocalStorage<UseCacheInvocationState>();
const useCacheWrappedMarker = Symbol.for('vista.use-cache.wrapped');

function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
    )
  );
}

function addFunctionKeyToTagIndex(cacheKey: string, tags: string[]): void {
  for (const tag of tags) {
    const keys = tagToFunctionKeys.get(tag) ?? new Set<string>();
    keys.add(cacheKey);
    tagToFunctionKeys.set(tag, keys);
  }
}

function addUseCacheKeyToTagIndex(cacheKey: string, tags: string[]): void {
  for (const tag of tags) {
    const keys = tagToUseCacheKeys.get(tag) ?? new Set<string>();
    keys.add(cacheKey);
    tagToUseCacheKeys.set(tag, keys);
  }
}

function removeFunctionKeyFromTagIndex(cacheKey: string, tags: string[]): void {
  for (const tag of tags) {
    const keys = tagToFunctionKeys.get(tag);
    if (!keys) continue;
    keys.delete(cacheKey);
    if (keys.size === 0) {
      tagToFunctionKeys.delete(tag);
    }
  }
}

function removeUseCacheKeyFromTagIndex(cacheKey: string, tags: string[]): void {
  for (const tag of tags) {
    const keys = tagToUseCacheKeys.get(tag);
    if (!keys) continue;
    keys.delete(cacheKey);
    if (keys.size === 0) {
      tagToUseCacheKeys.delete(tag);
    }
  }
}

function isFresh(entry: FunctionCacheEntry): boolean {
  if (entry.revalidate === false) {
    return true;
  }

  const maxAgeMs = Math.max(0, entry.revalidate) * 1000;
  return Date.now() - entry.createdAt <= maxAgeMs;
}

function buildCacheKey(keyParts: string[], args: unknown[]): string {
  return JSON.stringify([keyParts, args]);
}

function buildUseCacheKey(filePath: string, exportName: string, args: unknown[]): string {
  return JSON.stringify([
    'use-cache',
    filePath,
    exportName,
    args,
  ]);
}

function resolveStaticArtifactPaths(vistaDirRoot: string, urlPath: string): string[] {
  const staticDir = path.join(vistaDirRoot, 'static', 'pages');
  const safePath = urlPath === '/' ? '/index' : urlPath;
  return ['.html', '.meta.json', '.rsc'].map((extension) => path.join(staticDir, `${safePath}${extension}`));
}

function removeStaticArtifacts(vistaDirRoot: string | undefined, urlPath: string): void {
  if (!vistaDirRoot) {
    return;
  }

  for (const absolutePath of resolveStaticArtifactPaths(vistaDirRoot, urlPath)) {
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch {
      // Ignore cache cleanup failures.
    }
  }
}

export function unstable_cache<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => Promise<TResult> | TResult,
  keyParts: string[] = [],
  options: CacheLifeOptions = {}
): (...args: TArgs) => Promise<TResult> {
  const normalizedTags = normalizeTags(options.tags);
  const normalizedKeyParts = keyParts.map((part) => String(part));
  const revalidate = options.revalidate === undefined ? false : options.revalidate;

  return async (...args: TArgs): Promise<TResult> => {
    trackCacheTags(normalizedTags);

    const cacheKey = buildCacheKey(normalizedKeyParts, Array.from(args));
    const existing = functionCache.get(cacheKey);
    if (existing && isFresh(existing)) {
      return existing.value as TResult;
    }

    if (existing) {
      removeFunctionKeyFromTagIndex(cacheKey, existing.tags);
      functionCache.delete(cacheKey);
    }

    const value = await callback(...args);
    const entry: FunctionCacheEntry = {
      createdAt: Date.now(),
      revalidate,
      tags: normalizedTags,
      value,
    };

    functionCache.set(cacheKey, entry);
    addFunctionKeyToTagIndex(cacheKey, normalizedTags);
    return value;
  };
}

function getUseCacheInvocationState(): UseCacheInvocationState | undefined {
  return useCacheScope.getStore();
}

export function cacheTag(...tags: string[]): void {
  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length === 0) {
    return;
  }

  const scope = getUseCacheInvocationState();
  if (scope) {
    for (const tag of normalizedTags) {
      scope.tags.add(tag);
    }
  }

  trackCacheTags(normalizedTags);
}

export function cacheLife(
  profile:
    | number
    | false
    | CacheLifeOptions
    | undefined = false
): void {
  const scope = getUseCacheInvocationState();
  if (!scope) {
    return;
  }

  if (typeof profile === 'number' || profile === false) {
    scope.revalidate = profile;
    return;
  }

  if (profile && typeof profile === 'object') {
    if (profile.revalidate !== undefined) {
      scope.revalidate = profile.revalidate;
    }
    if (Array.isArray(profile.tags)) {
      for (const tag of normalizeTags(profile.tags)) {
        scope.tags.add(tag);
      }
    }
  }
}

function createUseCacheInvocationState(): UseCacheInvocationState {
  return {
    revalidate: false,
    tags: new Set<string>(),
  };
}

function finalizeUseCacheEntry<TResult>(
  cacheKey: string,
  state: UseCacheInvocationState,
  value: TResult
): TResult {
  const tags = normalizeTags(Array.from(state.tags));
  const entry: UseCacheEntry = {
    createdAt: Date.now(),
    revalidate: state.revalidate,
    tags,
    value,
  };

  const existing = useCacheEntries.get(cacheKey);
  if (existing) {
    removeUseCacheKeyFromTagIndex(cacheKey, existing.tags);
  }

  useCacheEntries.set(cacheKey, entry);
  addUseCacheKeyToTagIndex(cacheKey, tags);
  trackCacheTags(tags);
  return value;
}

export function wrapModuleUseCacheExport<T>(value: T, filePath: string, exportName: string): T {
  if (typeof value !== 'function') {
    return value;
  }

  const original = value as T & {
    [useCacheWrappedMarker]?: boolean;
  } & ((...args: unknown[]) => unknown);

  if (original[useCacheWrappedMarker]) {
    return value;
  }

  const wrapped = function vistaUseCacheWrapped(this: unknown, ...args: unknown[]) {
    const cacheKey = buildUseCacheKey(filePath, exportName, args);
    const existing = useCacheEntries.get(cacheKey);
    if (existing && isFresh(existing)) {
      trackCacheTags(existing.tags);
      return existing.value;
    }

    if (existing) {
      removeUseCacheKeyFromTagIndex(cacheKey, existing.tags);
      useCacheEntries.delete(cacheKey);
    }

    const invoke = () => original.apply(this, args);
    const state = createUseCacheInvocationState();

    return useCacheScope.run(state, () => {
      const result = invoke();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((resolved) =>
          finalizeUseCacheEntry(cacheKey, state, resolved)
        );
      }

      return finalizeUseCacheEntry(cacheKey, state, result);
    });
  } as typeof original;

  Object.defineProperty(wrapped, useCacheWrappedMarker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(wrapped, 'name', {
    value: original.name || exportName || 'vistaUseCacheWrapped',
    configurable: true,
  });

  return wrapped as T;
}

export function revalidateTag(tag: string): void {
  const normalized = String(tag || '').trim();
  if (!normalized) {
    return;
  }

  const functionKeys = Array.from(tagToFunctionKeys.get(normalized) ?? []);
  for (const cacheKey of functionKeys) {
    const entry = functionCache.get(cacheKey);
    if (entry) {
      removeFunctionKeyFromTagIndex(cacheKey, entry.tags);
    }
    functionCache.delete(cacheKey);
  }
  tagToFunctionKeys.delete(normalized);

  const useCacheKeys = Array.from(tagToUseCacheKeys.get(normalized) ?? []);
  for (const cacheKey of useCacheKeys) {
    const entry = useCacheEntries.get(cacheKey);
    if (entry) {
      removeUseCacheKeyFromTagIndex(cacheKey, entry.tags);
    }
    useCacheEntries.delete(cacheKey);
  }
  tagToUseCacheKeys.delete(normalized);

  const context = getRequestContext();
  const affectedPaths = invalidateCachedPagesByTag(normalized);
  for (const urlPath of affectedPaths) {
    removeStaticArtifacts(context?.vistaDirRoot, urlPath);
  }

  recordRevalidatedTag(normalized);
}

export function revalidatePath(urlPath: string): void {
  const normalized = String(urlPath || '').trim();
  if (!normalized) {
    return;
  }

  invalidateCachedPage(normalized);
  removeStaticArtifacts(getRequestContext()?.vistaDirRoot, normalized);
  recordRevalidatedPath(normalized);
}
