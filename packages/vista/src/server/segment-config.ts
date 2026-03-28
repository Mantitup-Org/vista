import path from 'path';

export const SEGMENT_CONFIG_EXPORTS = [
  'dynamic',
  'revalidate',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'fetchCache',
] as const;

export type SegmentConfigExportName = (typeof SEGMENT_CONFIG_EXPORTS)[number];

export type SegmentDynamicMode = 'auto' | 'force-dynamic' | 'force-static' | 'error';
export type SegmentRuntime = 'nodejs' | 'edge' | 'experimental-edge';
export type SegmentFetchCache =
  | 'auto'
  | 'default-cache'
  | 'only-cache'
  | 'force-cache'
  | 'default-no-store'
  | 'only-no-store'
  | 'force-no-store';

export interface SegmentConfig {
  dynamic?: SegmentDynamicMode;
  revalidate?: number | false;
  runtime?: SegmentRuntime;
  preferredRegion?: string | string[];
  maxDuration?: number;
  fetchCache?: SegmentFetchCache;
}

export interface SegmentConfigIssue {
  filePath: string;
  exportName: SegmentConfigExportName;
  message: string;
  fix?: string;
}

export interface SegmentConfigParseResult {
  config: SegmentConfig;
  issues: SegmentConfigIssue[];
}

export interface ResolvedSegmentConfig extends SegmentConfig {
  runtime: SegmentRuntime;
  fetchCache: SegmentFetchCache;
  dynamic: SegmentDynamicMode;
}

export interface RouteSegmentComponent {
  absolutePath: string;
  segmentConfig?: SegmentConfig;
}

const VALID_DYNAMIC_VALUES = new Set<SegmentDynamicMode>([
  'auto',
  'force-dynamic',
  'force-static',
  'error',
]);
const VALID_RUNTIME_VALUES = new Set<SegmentRuntime>(['nodejs', 'edge', 'experimental-edge']);
const VALID_FETCH_CACHE_VALUES = new Set<SegmentFetchCache>([
  'auto',
  'default-cache',
  'only-cache',
  'force-cache',
  'default-no-store',
  'only-no-store',
  'force-no-store',
]);

function stripCommentsAndWhitespace(source: string): string {
  let remaining = source;
  while (true) {
    remaining = remaining.trimStart();
    if (remaining.startsWith('//')) {
      const newlineIndex = remaining.indexOf('\n');
      remaining = newlineIndex === -1 ? '' : remaining.slice(newlineIndex + 1);
      continue;
    }
    if (remaining.startsWith('/*')) {
      const commentEndIndex = remaining.indexOf('*/');
      if (commentEndIndex === -1) {
        return remaining;
      }
      remaining = remaining.slice(commentEndIndex + 2);
      continue;
    }
    return remaining;
  }
}

function normalizeSource(source: string): string {
  return stripCommentsAndWhitespace(source);
}

function extractRawExportValue(source: string, exportName: SegmentConfigExportName): string | null {
  const normalizedSource = normalizeSource(source);
  const exportPattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`,
    'm'
  );
  const match = normalizedSource.match(exportPattern);
  return match?.[1]?.trim() ?? null;
}

function extractQuotedStrings(rawValue: string): string[] | null {
  const trimmed = rawValue.trim();
  const singleMatch = trimmed.match(/^['"]([^'"]+)['"]$/);
  if (singleMatch) {
    return [singleMatch[1]];
  }

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const values = Array.from(trimmed.matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]);
  if (values.length === 0) {
    return null;
  }

  const rebuilt = `[${values.map((value) => `'${value}'`).join(', ')}]`;
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (!normalized.includes('[') || !normalized.includes(']')) {
    return null;
  }
  if (!rebuilt.startsWith('[')) {
    return null;
  }

  return values;
}

function createIssue(
  filePath: string,
  exportName: SegmentConfigExportName,
  message: string,
  fix?: string
): SegmentConfigIssue {
  return {
    filePath,
    exportName,
    message,
    fix,
  };
}

export function hasUseClientDirective(source: string): boolean {
  const trimmed = normalizeSource(source);
  return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
}

export function hasUseServerDirective(source: string): boolean {
  const trimmed = normalizeSource(source);
  return trimmed.startsWith("'use server'") || trimmed.startsWith('"use server"');
}

export function parseSegmentConfig(
  source: string,
  filePath: string
): SegmentConfigParseResult {
  const issues: SegmentConfigIssue[] = [];
  const config: SegmentConfig = {};

  const rawDynamic = extractRawExportValue(source, 'dynamic');
  if (rawDynamic !== null) {
    const dynamicValue = extractQuotedStrings(rawDynamic)?.[0];
    if (!dynamicValue || !VALID_DYNAMIC_VALUES.has(dynamicValue as SegmentDynamicMode)) {
      issues.push(
        createIssue(
          filePath,
          'dynamic',
          `Invalid segment config export "dynamic" in ${path.basename(
            filePath
          )}. Expected one of: auto, force-dynamic, force-static, error.`,
          `Use a string literal export such as: export const dynamic = 'force-dynamic'`
        )
      );
    } else {
      config.dynamic = dynamicValue as SegmentDynamicMode;
    }
  }

  const rawRevalidate = extractRawExportValue(source, 'revalidate');
  if (rawRevalidate !== null) {
    if (/^false$/i.test(rawRevalidate)) {
      config.revalidate = false;
    } else if (/^\d+$/.test(rawRevalidate)) {
      config.revalidate = Number.parseInt(rawRevalidate, 10);
    } else {
      issues.push(
        createIssue(
          filePath,
          'revalidate',
          `Invalid segment config export "revalidate" in ${path.basename(
            filePath
          )}. Expected a non-negative integer or false.`,
          `Use a literal export such as: export const revalidate = 60`
        )
      );
    }
  }

  const rawRuntime = extractRawExportValue(source, 'runtime');
  if (rawRuntime !== null) {
    const runtimeValue = extractQuotedStrings(rawRuntime)?.[0];
    if (!runtimeValue || !VALID_RUNTIME_VALUES.has(runtimeValue as SegmentRuntime)) {
      issues.push(
        createIssue(
          filePath,
          'runtime',
          `Invalid segment config export "runtime" in ${path.basename(
            filePath
          )}. Expected "nodejs", "edge", or "experimental-edge".`,
          `Use a string literal export such as: export const runtime = 'nodejs'`
        )
      );
    } else {
      config.runtime = runtimeValue as SegmentRuntime;
    }
  }

  const rawPreferredRegion = extractRawExportValue(source, 'preferredRegion');
  if (rawPreferredRegion !== null) {
    const values = extractQuotedStrings(rawPreferredRegion);
    if (!values) {
      issues.push(
        createIssue(
          filePath,
          'preferredRegion',
          `Invalid segment config export "preferredRegion" in ${path.basename(
            filePath
          )}. Expected a string literal or an array of string literals.`,
          `Use a literal export such as: export const preferredRegion = ['home', 'global']`
        )
      );
    } else {
      config.preferredRegion = values.length === 1 ? values[0] : values;
    }
  }

  const rawMaxDuration = extractRawExportValue(source, 'maxDuration');
  if (rawMaxDuration !== null) {
    if (/^\d+$/.test(rawMaxDuration)) {
      config.maxDuration = Number.parseInt(rawMaxDuration, 10);
    } else {
      issues.push(
        createIssue(
          filePath,
          'maxDuration',
          `Invalid segment config export "maxDuration" in ${path.basename(
            filePath
          )}. Expected a non-negative integer.`,
          `Use a literal export such as: export const maxDuration = 5`
        )
      );
    }
  }

  const rawFetchCache = extractRawExportValue(source, 'fetchCache');
  if (rawFetchCache !== null) {
    const fetchCacheValue = extractQuotedStrings(rawFetchCache)?.[0];
    if (!fetchCacheValue || !VALID_FETCH_CACHE_VALUES.has(fetchCacheValue as SegmentFetchCache)) {
      issues.push(
        createIssue(
          filePath,
          'fetchCache',
          `Invalid segment config export "fetchCache" in ${path.basename(
            filePath
          )}. Expected one of: ${Array.from(VALID_FETCH_CACHE_VALUES).join(', ')}.`,
          `Use a string literal export such as: export const fetchCache = 'force-no-store'`
        )
      );
    } else {
      config.fetchCache = fetchCacheValue as SegmentFetchCache;
    }
  }

  return { config, issues };
}

export function mergeSegmentConfigs(
  components: Array<RouteSegmentComponent | undefined>
): ResolvedSegmentConfig {
  const merged: ResolvedSegmentConfig = {
    dynamic: 'auto',
    runtime: 'nodejs',
    fetchCache: 'auto',
  };

  for (const component of components) {
    if (!component?.segmentConfig) {
      continue;
    }

    const config = component.segmentConfig;
    if (config.dynamic !== undefined) {
      merged.dynamic = config.dynamic;
    }
    if (config.revalidate !== undefined) {
      merged.revalidate = config.revalidate;
    }
    if (config.runtime !== undefined) {
      merged.runtime = config.runtime;
    }
    if (config.preferredRegion !== undefined) {
      merged.preferredRegion = config.preferredRegion;
    }
    if (config.maxDuration !== undefined) {
      merged.maxDuration = config.maxDuration;
    }
    if (config.fetchCache !== undefined) {
      merged.fetchCache = config.fetchCache;
    }
  }

  return merged;
}

export function getSegmentConfigExportNames(source: string): SegmentConfigExportName[] {
  return SEGMENT_CONFIG_EXPORTS.filter(
    (exportName) => extractRawExportValue(source, exportName) !== null
  );
}
