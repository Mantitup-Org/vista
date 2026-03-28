"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateModuleBoundaries = validateModuleBoundaries;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const segment_config_1 = require("./segment-config");
const FILE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const ROUTE_SEGMENT_FILES = new Set(['page', 'layout', 'root', 'route']);
const CLIENT_HOOKS = [
    'useState',
    'useEffect',
    'useLayoutEffect',
    'useReducer',
    'useRef',
    'useImperativeHandle',
    'useCallback',
    'useMemo',
    'useContext',
    'useDebugValue',
    'useDeferredValue',
    'useTransition',
    'useId',
    'useSyncExternalStore',
    'useInsertionEffect',
];
const CLIENT_APIS = ['createContext', 'forwardRef', 'memo', 'lazy', 'startTransition'];
const BROWSER_GLOBALS = [
    'window',
    'document',
    'localStorage',
    'sessionStorage',
    'navigator',
    'location',
    'history',
    'requestAnimationFrame',
];
const SERVER_ONLY_SPECIFIERS = new Set([
    'vista/server',
    '@vistagenic/vista/server',
    'vista/cache',
    '@vistagenic/vista/cache',
]);
const BROWSER_ONLY_MODULES = new Set(['react-dom/client', 'client-only']);
const NODE_BUILTINS = new Set([
    'assert',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'diagnostics_channel',
    'dns',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'readline',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'tty',
    'url',
    'util',
    'vm',
    'worker_threads',
    'zlib',
]);
function createIssue(code, filePath, message, fix) {
    return {
        code,
        filePath,
        message,
        fix,
    };
}
function stripLeadingCommentsAndWhitespace(source) {
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
function hasTopLevelDirective(source, directive) {
    const normalized = stripLeadingCommentsAndWhitespace(source);
    return normalized.startsWith(`'${directive}'`) || normalized.startsWith(`"${directive}"`);
}
function containsDirectiveLiteral(source, directive) {
    return source.includes(`'${directive}'`) || source.includes(`"${directive}"`);
}
function scanFiles(dir, collected) {
    if (!fs_1.default.existsSync(dir)) {
        return;
    }
    const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                scanFiles(fullPath, collected);
            }
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        if (FILE_EXTENSIONS.has(path_1.default.extname(entry.name))) {
            collected.push(fullPath);
        }
    }
}
function detectClientOnlyUsages(source) {
    const usages = [];
    for (const hook of CLIENT_HOOKS) {
        if (new RegExp(`\\b${hook}\\s*[(<]`).test(source)) {
            usages.push(hook);
        }
    }
    for (const api of CLIENT_APIS) {
        if (new RegExp(`\\b${api}\\s*[(<]`).test(source)) {
            usages.push(api);
        }
    }
    for (const globalName of BROWSER_GLOBALS) {
        if (new RegExp(`\\b${globalName}\\s*[.\\[]`).test(source)) {
            usages.push(globalName);
        }
    }
    if (/\bon[A-Z][a-zA-Z]*\s*=/.test(source)) {
        usages.push('event handlers');
    }
    return Array.from(new Set(usages));
}
function parseImportSpecifiers(source) {
    const specifiers = new Set();
    for (const match of source.matchAll(/import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
        if (match[1]) {
            specifiers.add(match[1]);
        }
    }
    for (const match of source.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
        if (match[1]) {
            specifiers.add(match[1]);
        }
    }
    return Array.from(specifiers);
}
function isNodeBuiltin(specifier) {
    if (specifier.startsWith('node:')) {
        return NODE_BUILTINS.has(specifier.slice('node:'.length));
    }
    return NODE_BUILTINS.has(specifier);
}
function isRouteSegmentFile(appDir, filePath) {
    const normalizedAppDir = path_1.default.resolve(appDir);
    const normalizedFilePath = path_1.default.resolve(filePath);
    if (!normalizedFilePath.startsWith(`${normalizedAppDir}${path_1.default.sep}`) && normalizedFilePath !== normalizedAppDir) {
        return false;
    }
    const baseName = path_1.default.basename(normalizedFilePath, path_1.default.extname(normalizedFilePath));
    return ROUTE_SEGMENT_FILES.has(baseName);
}
function getRouteSegmentBaseName(filePath) {
    return path_1.default.basename(filePath, path_1.default.extname(filePath));
}
function validateModuleBoundaries(input) {
    const roots = Array.from(new Set([input.appDir, ...(input.extraRoots || [])].map((entry) => path_1.default.resolve(entry))));
    const files = [];
    const issues = [];
    for (const root of roots) {
        scanFiles(root, files);
    }
    for (const filePath of files) {
        let source = '';
        try {
            source = fs_1.default.readFileSync(filePath, 'utf-8');
        }
        catch {
            continue;
        }
        const isClient = (0, segment_config_1.hasUseClientDirective)(source);
        const hasTopLevelUseCacheDirective = hasTopLevelDirective(source, 'use cache');
        const containsUseCacheDirective = containsDirectiveLiteral(source, 'use cache');
        const importSpecifiers = parseImportSpecifiers(source);
        if (!isClient) {
            if (containsUseCacheDirective && !input.cacheComponentsEnabled) {
                issues.push(createIssue('USE_CACHE_NOT_ENABLED', filePath, `Cache Components violation in ${path_1.default.basename(filePath)}: to use "use cache", enable experimental.cacheComponents.enabled in vista.config.*.`, "Add `experimental: { cacheComponents: { enabled: true } }` to your Vista config."));
            }
            const clientOnlyUsages = detectClientOnlyUsages(source);
            if (clientOnlyUsages.length > 0) {
                issues.push(createIssue('CLIENT_HOOKS_IN_SERVER_COMPONENT', filePath, `Server Component violation in ${path_1.default.basename(filePath)}: ${clientOnlyUsages.join(', ')} can only be used in a Client Component.`, `Add 'use client' at the top of ${path_1.default.basename(filePath)} or move the client-only logic into a child client component.`));
            }
            const browserOnlyImports = importSpecifiers.filter((specifier) => BROWSER_ONLY_MODULES.has(specifier));
            if (browserOnlyImports.length > 0) {
                issues.push(createIssue('SERVER_IMPORTS_BROWSER_ONLY_MODULE', filePath, `Server Component violation in ${path_1.default.basename(filePath)}: browser-only module import ${browserOnlyImports.join(', ')} is not allowed in a Server Component.`, 'Remove the browser-only import or move it into a Client Component.'));
            }
        }
        else {
            if (containsUseCacheDirective) {
                issues.push(createIssue('CLIENT_DEFINES_USE_CACHE', filePath, `Client Component violation in ${path_1.default.basename(filePath)}: "use cache" cannot be defined inside a Client Component.`, 'Move the cached logic into a Server Component or a server-only module.'));
            }
            const invalidServerImports = importSpecifiers.filter((specifier) => SERVER_ONLY_SPECIFIERS.has(specifier));
            if (invalidServerImports.length > 0) {
                issues.push(createIssue('CLIENT_IMPORTS_SERVER_ONLY_API', filePath, `Client Component violation in ${path_1.default.basename(filePath)}: server-only APIs ${invalidServerImports.join(', ')} cannot be imported from a Client Component.`, 'Move the server-only logic into a Server Component or a server action module.'));
            }
            const nodeImports = importSpecifiers.filter((specifier) => isNodeBuiltin(specifier));
            if (nodeImports.length > 0) {
                issues.push(createIssue('CLIENT_IMPORTS_NODE_BUILTIN', filePath, `Client Component violation in ${path_1.default.basename(filePath)}: Node.js modules ${nodeImports.join(', ')} are not available in the browser.`, 'Remove the Node.js import or move it into a Server Component.'));
            }
            const containsServerActionDirective = /['"]use server['"]/.test(stripLeadingCommentsAndWhitespace(source)) &&
                !hasTopLevelDirective(source, 'use server');
            if (containsServerActionDirective) {
                issues.push(createIssue('CLIENT_DEFINES_SERVER_ACTION', filePath, `Client Component violation in ${path_1.default.basename(filePath)}: inline "use server" actions cannot be defined inside a Client Component.`, 'Move the server action into a Server Component or a standalone server action module.'));
            }
        }
        if (isRouteSegmentFile(input.appDir, filePath)) {
            const segmentBaseName = getRouteSegmentBaseName(filePath);
            const isRouteHandlerFile = segmentBaseName === 'route';
            const parsedConfig = (0, segment_config_1.parseSegmentConfig)(source, filePath);
            for (const configIssue of parsedConfig.issues) {
                issues.push(createIssue('INVALID_SEGMENT_CONFIG', configIssue.filePath, configIssue.message, configIssue.fix));
            }
            if ((parsedConfig.config.runtime === 'edge' ||
                parsedConfig.config.runtime === 'experimental-edge') &&
                !isRouteHandlerFile) {
                issues.push(createIssue('UNSUPPORTED_SEGMENT_RUNTIME', filePath, `Segment config violation in ${path_1.default.basename(filePath)}: runtime "${parsedConfig.config.runtime}" is not supported yet in Vista. Use "nodejs".`, `Replace the runtime export with: export const runtime = 'nodejs'`));
            }
            if ((parsedConfig.config.runtime === 'edge' ||
                parsedConfig.config.runtime === 'experimental-edge') &&
                /export\s+(async\s+)?function\s+generateStaticParams\b/.test(source) &&
                !isRouteHandlerFile) {
                issues.push(createIssue('EDGE_RUNTIME_GENERATE_STATIC_PARAMS', filePath, `Segment config violation in ${path_1.default.basename(filePath)}: runtime "${parsedConfig.config.runtime}" cannot be used together with generateStaticParams in Vista.`, 'Use runtime = \'nodejs\' or remove generateStaticParams.'));
            }
        }
    }
    return { issues };
}
