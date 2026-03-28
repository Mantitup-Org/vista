import fs from 'fs';
import path from 'path';

const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

type InterceptionMarker = '(.)' | '(..)' | '(..)(..)' | '(...)';

export interface MatchedAppModule {
  filePath: string;
  params: Record<string, string>;
  source: 'page' | 'default' | 'interception';
}

export interface ParallelSlotMatch extends MatchedAppModule {
  slotName: string;
  slotRootDir: string;
}

function listRouteDirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules'
    )
    .map((entry) => entry.name);
}

function collectParallelSlotRoots(
  dir: string
): Array<{ slotName: string; slotRootDir: string }> {
  const slotRoots: Array<{ slotName: string; slotRootDir: string }> = [];

  for (const childName of listRouteDirectories(dir)) {
    const childDir = path.join(dir, childName);
    if (isParallelRouteSegment(childName)) {
      slotRoots.push({
        slotName: childName.slice(1),
        slotRootDir: childDir,
      });
      continue;
    }

    if (isRouteGroupSegment(childName)) {
      slotRoots.push(...collectParallelSlotRoots(childDir));
    }
  }

  return slotRoots;
}

export function resolveConventionModule(dir: string, stem: string): string | null {
  for (const extension of FILE_EXTENSIONS) {
    const absolutePath = path.join(dir, `${stem}${extension}`);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

function resolvePageModule(dir: string): string | null {
  return resolveConventionModule(dir, 'page') ?? resolveConventionModule(dir, 'index');
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']');
}

function isCatchAllSegment(segment: string): boolean {
  return segment.startsWith('[...') && segment.endsWith(']');
}

function isOptionalCatchAllSegment(segment: string): boolean {
  return segment.startsWith('[[...') && segment.endsWith(']]');
}

function getParamName(segment: string): string {
  return segment.replace(/^\[\[?\.\.\./, '').replace(/^\[/, '').replace(/\]\]?$/, '');
}

function countVisibleSegments(relativeSegments: string[]): number {
  return relativeSegments.filter(
    (segment) => !isRouteGroupSegment(segment) && !isParallelRouteSegment(segment)
  ).length;
}

function matchSegment(
  segment: string,
  pathSegments: string[],
  index: number,
  params: Record<string, string>
): { nextIndex: number; params: Record<string, string> } | null {
  if (isOptionalCatchAllSegment(segment)) {
    const paramName = getParamName(segment);
    return {
      nextIndex: pathSegments.length,
      params: {
        ...params,
        [paramName]: pathSegments.slice(index).join('/'),
      },
    };
  }

  if (isCatchAllSegment(segment)) {
    if (index >= pathSegments.length) {
      return null;
    }
    const paramName = getParamName(segment);
    return {
      nextIndex: pathSegments.length,
      params: {
        ...params,
        [paramName]: pathSegments.slice(index).join('/'),
      },
    };
  }

  if (isDynamicSegment(segment)) {
    if (index >= pathSegments.length) {
      return null;
    }
    const paramName = getParamName(segment);
    return {
      nextIndex: index + 1,
      params: {
        ...params,
        [paramName]: pathSegments[index] || '',
      },
    };
  }

  if (pathSegments[index] !== segment) {
    return null;
  }

  return {
    nextIndex: index + 1,
    params,
  };
}

function matchAppSubtree(
  dir: string,
  pathSegments: string[],
  index = 0,
  params: Record<string, string> = {}
): MatchedAppModule | null {
  const childDirs = listRouteDirectories(dir);

  for (const childName of childDirs) {
    if (!isRouteGroupSegment(childName)) {
      continue;
    }

    const match = matchAppSubtree(path.join(dir, childName), pathSegments, index, params);
    if (match) {
      return match;
    }
  }

  if (index === pathSegments.length) {
    const pagePath = resolvePageModule(dir);
    if (pagePath) {
      return {
        filePath: pagePath,
        params,
        source: 'page',
      };
    }
  }

  const staticDirs = childDirs.filter(
    (childName) =>
      !isRouteGroupSegment(childName) &&
      !isParallelRouteSegment(childName) &&
      !isInterceptionRouteSegment(childName) &&
      !isDynamicSegment(childName) &&
      !isCatchAllSegment(childName) &&
      !isOptionalCatchAllSegment(childName)
  );

  for (const childName of staticDirs) {
    const segmentMatch = matchSegment(childName, pathSegments, index, params);
    if (!segmentMatch) {
      continue;
    }

    const match = matchAppSubtree(
      path.join(dir, childName),
      pathSegments,
      segmentMatch.nextIndex,
      segmentMatch.params
    );
    if (match) {
      return match;
    }
  }

  const dynamicDirs = childDirs.filter(
    (childName) =>
      !isRouteGroupSegment(childName) &&
      !isParallelRouteSegment(childName) &&
      !isInterceptionRouteSegment(childName) &&
      isDynamicSegment(childName) &&
      !isCatchAllSegment(childName) &&
      !isOptionalCatchAllSegment(childName)
  );

  for (const childName of dynamicDirs) {
    const segmentMatch = matchSegment(childName, pathSegments, index, params);
    if (!segmentMatch) {
      continue;
    }

    const match = matchAppSubtree(
      path.join(dir, childName),
      pathSegments,
      segmentMatch.nextIndex,
      segmentMatch.params
    );
    if (match) {
      return match;
    }
  }

  const catchAllDirs = childDirs.filter(
    (childName) =>
      !isRouteGroupSegment(childName) &&
      !isParallelRouteSegment(childName) &&
      !isInterceptionRouteSegment(childName) &&
      (isCatchAllSegment(childName) || isOptionalCatchAllSegment(childName))
  );

  for (const childName of catchAllDirs) {
    const segmentMatch = matchSegment(childName, pathSegments, index, params);
    if (!segmentMatch) {
      continue;
    }

    const match = matchAppSubtree(
      path.join(dir, childName),
      pathSegments,
      segmentMatch.nextIndex,
      segmentMatch.params
    );
    if (match) {
      return match;
    }
  }

  return null;
}

function markerBaseDepth(marker: InterceptionMarker, layoutVisibleDepth: number): number {
  switch (marker) {
    case '(...)':
      return 0;
    case '(..)(..)':
      return Math.max(layoutVisibleDepth - 2, 0);
    case '(..)':
      return Math.max(layoutVisibleDepth - 1, 0);
    case '(.)':
    default:
      return layoutVisibleDepth;
  }
}

function matchInterceptionSubtree(
  dir: string,
  pathSegments: string[],
  layoutVisibleDepth: number,
  params: Record<string, string> = {}
): MatchedAppModule | null {
  const childDirs = listRouteDirectories(dir);

  for (const childName of childDirs) {
    if (isRouteGroupSegment(childName)) {
      const match = matchInterceptionSubtree(
        path.join(dir, childName),
        pathSegments,
        layoutVisibleDepth,
        params
      );
      if (match) {
        return match;
      }
    }
  }

  for (const childName of childDirs) {
    const interception = parseInterceptionSegment(childName);
    if (!interception) {
      continue;
    }

    const baseDepth = markerBaseDepth(interception.marker, layoutVisibleDepth);
    const segmentMatch = matchSegment(interception.target, pathSegments, baseDepth, params);
    if (!segmentMatch) {
      continue;
    }

    const match = matchAppSubtree(
      path.join(dir, childName),
      pathSegments,
      segmentMatch.nextIndex,
      segmentMatch.params
    );
    if (match) {
      return {
        ...match,
        source: 'interception',
      };
    }
  }

  return null;
}

export function parseInterceptionSegment(
  segment: string
): { marker: InterceptionMarker; target: string } | null {
  const markers: InterceptionMarker[] = ['(..)(..)', '(...)', '(..)', '(.)'];

  for (const marker of markers) {
    if (segment.startsWith(marker) && segment.length > marker.length) {
      return {
        marker,
        target: segment.slice(marker.length),
      };
    }
  }

  return null;
}

export function isInterceptionRouteSegment(segment: string): boolean {
  return parseInterceptionSegment(segment) !== null;
}

export function isRouteGroupSegment(segment: string): boolean {
  return (
    segment.startsWith('(') &&
    segment.endsWith(')') &&
    !isInterceptionRouteSegment(segment)
  );
}

export function isParallelRouteSegment(segment: string): boolean {
  return segment.startsWith('@');
}

export function resolveParallelSlotMatches(input: {
  appDir: string;
  layoutPath: string;
  pathname: string;
}): ParallelSlotMatch[] {
  const layoutDir = path.dirname(input.layoutPath);
  const relativeLayoutSegments = path
    .relative(input.appDir, layoutDir)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  const layoutVisibleDepth = countVisibleSegments(relativeLayoutSegments);
  const pathnameSegments = input.pathname.split('/').filter(Boolean);
  const descendantSegments = pathnameSegments.slice(layoutVisibleDepth);

  const matches: ParallelSlotMatch[] = [];

  for (const { slotName, slotRootDir } of collectParallelSlotRoots(layoutDir)) {
    const slotDir = slotRootDir;
    let match = matchAppSubtree(slotDir, descendantSegments);
    if (!match) {
      match = matchInterceptionSubtree(slotDir, pathnameSegments, layoutVisibleDepth);
    }
    if (!match) {
      const defaultPath = resolveConventionModule(slotDir, 'default');
      if (defaultPath) {
        match = {
          filePath: defaultPath,
          params: {},
          source: 'default',
        };
      }
    }

    if (match) {
      matches.push({
        slotName,
        slotRootDir: slotDir,
        ...match,
      });
    }
  }

  return matches;
}

export function resolveDirectoryChain(rootDir: string, entryFilePath: string): string[] {
  const resolvedRootDir = path.resolve(rootDir);
  const resolvedEntryDir = path.resolve(path.dirname(entryFilePath));

  if (!resolvedEntryDir.startsWith(resolvedRootDir)) {
    return [resolvedEntryDir];
  }

  const relativeSegments = path
    .relative(resolvedRootDir, resolvedEntryDir)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  const chain = [resolvedRootDir];
  let currentDir = resolvedRootDir;
  for (const segment of relativeSegments) {
    currentDir = path.join(currentDir, segment);
    chain.push(currentDir);
  }

  return chain;
}

export function resolveNearestSegmentNotFoundPath(
  appDir: string,
  startDir: string
): string | null {
  let currentDir = path.resolve(startDir);
  const resolvedAppDir = path.resolve(appDir);

  while (currentDir.startsWith(resolvedAppDir)) {
    const notFoundPath = resolveConventionModule(currentDir, 'not-found');
    if (notFoundPath) {
      return notFoundPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}
