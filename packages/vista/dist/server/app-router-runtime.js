"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConventionModule = resolveConventionModule;
exports.parseInterceptionSegment = parseInterceptionSegment;
exports.isInterceptionRouteSegment = isInterceptionRouteSegment;
exports.isRouteGroupSegment = isRouteGroupSegment;
exports.isParallelRouteSegment = isParallelRouteSegment;
exports.resolveParallelSlotMatches = resolveParallelSlotMatches;
exports.resolveDirectoryChain = resolveDirectoryChain;
exports.resolveNearestSegmentNotFoundPath = resolveNearestSegmentNotFoundPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
function listRouteDirectories(dir) {
    if (!fs_1.default.existsSync(dir)) {
        return [];
    }
    return fs_1.default
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map((entry) => entry.name);
}
function collectParallelSlotRoots(dir) {
    const slotRoots = [];
    for (const childName of listRouteDirectories(dir)) {
        const childDir = path_1.default.join(dir, childName);
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
function resolveConventionModule(dir, stem) {
    for (const extension of FILE_EXTENSIONS) {
        const absolutePath = path_1.default.join(dir, `${stem}${extension}`);
        if (fs_1.default.existsSync(absolutePath)) {
            return absolutePath;
        }
    }
    return null;
}
function resolvePageModule(dir) {
    return resolveConventionModule(dir, 'page') ?? resolveConventionModule(dir, 'index');
}
function isDynamicSegment(segment) {
    return segment.startsWith('[') && segment.endsWith(']');
}
function isCatchAllSegment(segment) {
    return segment.startsWith('[...') && segment.endsWith(']');
}
function isOptionalCatchAllSegment(segment) {
    return segment.startsWith('[[...') && segment.endsWith(']]');
}
function getParamName(segment) {
    return segment.replace(/^\[\[?\.\.\./, '').replace(/^\[/, '').replace(/\]\]?$/, '');
}
function countVisibleSegments(relativeSegments) {
    return relativeSegments.filter((segment) => !isRouteGroupSegment(segment) && !isParallelRouteSegment(segment)).length;
}
function matchSegment(segment, pathSegments, index, params) {
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
function matchAppSubtree(dir, pathSegments, index = 0, params = {}) {
    const childDirs = listRouteDirectories(dir);
    for (const childName of childDirs) {
        if (!isRouteGroupSegment(childName)) {
            continue;
        }
        const match = matchAppSubtree(path_1.default.join(dir, childName), pathSegments, index, params);
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
    const staticDirs = childDirs.filter((childName) => !isRouteGroupSegment(childName) &&
        !isParallelRouteSegment(childName) &&
        !isInterceptionRouteSegment(childName) &&
        !isDynamicSegment(childName) &&
        !isCatchAllSegment(childName) &&
        !isOptionalCatchAllSegment(childName));
    for (const childName of staticDirs) {
        const segmentMatch = matchSegment(childName, pathSegments, index, params);
        if (!segmentMatch) {
            continue;
        }
        const match = matchAppSubtree(path_1.default.join(dir, childName), pathSegments, segmentMatch.nextIndex, segmentMatch.params);
        if (match) {
            return match;
        }
    }
    const dynamicDirs = childDirs.filter((childName) => !isRouteGroupSegment(childName) &&
        !isParallelRouteSegment(childName) &&
        !isInterceptionRouteSegment(childName) &&
        isDynamicSegment(childName) &&
        !isCatchAllSegment(childName) &&
        !isOptionalCatchAllSegment(childName));
    for (const childName of dynamicDirs) {
        const segmentMatch = matchSegment(childName, pathSegments, index, params);
        if (!segmentMatch) {
            continue;
        }
        const match = matchAppSubtree(path_1.default.join(dir, childName), pathSegments, segmentMatch.nextIndex, segmentMatch.params);
        if (match) {
            return match;
        }
    }
    const catchAllDirs = childDirs.filter((childName) => !isRouteGroupSegment(childName) &&
        !isParallelRouteSegment(childName) &&
        !isInterceptionRouteSegment(childName) &&
        (isCatchAllSegment(childName) || isOptionalCatchAllSegment(childName)));
    for (const childName of catchAllDirs) {
        const segmentMatch = matchSegment(childName, pathSegments, index, params);
        if (!segmentMatch) {
            continue;
        }
        const match = matchAppSubtree(path_1.default.join(dir, childName), pathSegments, segmentMatch.nextIndex, segmentMatch.params);
        if (match) {
            return match;
        }
    }
    return null;
}
function markerBaseDepth(marker, layoutVisibleDepth) {
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
function matchInterceptionSubtree(dir, pathSegments, layoutVisibleDepth, params = {}) {
    const childDirs = listRouteDirectories(dir);
    for (const childName of childDirs) {
        if (isRouteGroupSegment(childName)) {
            const match = matchInterceptionSubtree(path_1.default.join(dir, childName), pathSegments, layoutVisibleDepth, params);
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
        const match = matchAppSubtree(path_1.default.join(dir, childName), pathSegments, segmentMatch.nextIndex, segmentMatch.params);
        if (match) {
            return {
                ...match,
                source: 'interception',
            };
        }
    }
    return null;
}
function parseInterceptionSegment(segment) {
    const markers = ['(..)(..)', '(...)', '(..)', '(.)'];
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
function isInterceptionRouteSegment(segment) {
    return parseInterceptionSegment(segment) !== null;
}
function isRouteGroupSegment(segment) {
    return (segment.startsWith('(') &&
        segment.endsWith(')') &&
        !isInterceptionRouteSegment(segment));
}
function isParallelRouteSegment(segment) {
    return segment.startsWith('@');
}
function resolveParallelSlotMatches(input) {
    const layoutDir = path_1.default.dirname(input.layoutPath);
    const relativeLayoutSegments = path_1.default
        .relative(input.appDir, layoutDir)
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);
    const layoutVisibleDepth = countVisibleSegments(relativeLayoutSegments);
    const pathnameSegments = input.pathname.split('/').filter(Boolean);
    const descendantSegments = pathnameSegments.slice(layoutVisibleDepth);
    const matches = [];
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
function resolveDirectoryChain(rootDir, entryFilePath) {
    const resolvedRootDir = path_1.default.resolve(rootDir);
    const resolvedEntryDir = path_1.default.resolve(path_1.default.dirname(entryFilePath));
    if (!resolvedEntryDir.startsWith(resolvedRootDir)) {
        return [resolvedEntryDir];
    }
    const relativeSegments = path_1.default
        .relative(resolvedRootDir, resolvedEntryDir)
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);
    const chain = [resolvedRootDir];
    let currentDir = resolvedRootDir;
    for (const segment of relativeSegments) {
        currentDir = path_1.default.join(currentDir, segment);
        chain.push(currentDir);
    }
    return chain;
}
function resolveNearestSegmentNotFoundPath(appDir, startDir) {
    let currentDir = path_1.default.resolve(startDir);
    const resolvedAppDir = path_1.default.resolve(appDir);
    while (currentDir.startsWith(resolvedAppDir)) {
        const notFoundPath = resolveConventionModule(currentDir, 'not-found');
        if (notFoundPath) {
            return notFoundPath;
        }
        const parentDir = path_1.default.dirname(currentDir);
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }
    return null;
}
