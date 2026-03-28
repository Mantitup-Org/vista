"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectAliasResolver = createProjectAliasResolver;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const projectAliasCache = new Map();
function stripJsonComments(input) {
    let result = '';
    let inString = false;
    let stringQuote = '';
    let isEscaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let index = 0; index < input.length; index++) {
        const current = input[index];
        const next = input[index + 1];
        if (inLineComment) {
            if (current === '\n') {
                inLineComment = false;
                result += current;
            }
            continue;
        }
        if (inBlockComment) {
            if (current === '*' && next === '/') {
                inBlockComment = false;
                index++;
            }
            continue;
        }
        if (inString) {
            result += current;
            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (current === '\\') {
                isEscaped = true;
                continue;
            }
            if (current === stringQuote) {
                inString = false;
                stringQuote = '';
            }
            continue;
        }
        if ((current === '"' || current === "'") && !inString) {
            inString = true;
            stringQuote = current;
            result += current;
            continue;
        }
        if (current === '/' && next === '/') {
            inLineComment = true;
            index++;
            continue;
        }
        if (current === '/' && next === '*') {
            inBlockComment = true;
            index++;
            continue;
        }
        result += current;
    }
    return result;
}
function isBareSpecifier(request) {
    if (!request)
        return false;
    if (request.startsWith('.') || request.startsWith('/'))
        return false;
    return !/^[A-Za-z]:[\\/]/.test(request);
}
function resolveAliasTargetPath(candidatePath) {
    const resolvedBase = path_1.default.resolve(candidatePath);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
    const directCandidates = path_1.default.extname(resolvedBase)
        ? [resolvedBase]
        : [resolvedBase, ...extensions.map((extension) => `${resolvedBase}${extension}`)];
    for (const candidate of directCandidates) {
        try {
            if (fs_1.default.existsSync(candidate) && fs_1.default.statSync(candidate).isFile()) {
                return candidate;
            }
        }
        catch {
            // continue
        }
    }
    try {
        if (fs_1.default.existsSync(resolvedBase) && fs_1.default.statSync(resolvedBase).isDirectory()) {
            const packageJsonPath = path_1.default.join(resolvedBase, 'package.json');
            if (fs_1.default.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf-8'));
                    if (packageJson.main) {
                        const packageMainPath = resolveAliasTargetPath(path_1.default.join(resolvedBase, packageJson.main));
                        if (packageMainPath)
                            return packageMainPath;
                    }
                }
                catch {
                    // ignore invalid package.json while resolving alias target
                }
            }
            for (const extension of extensions) {
                const indexPath = path_1.default.join(resolvedBase, `index${extension}`);
                if (fs_1.default.existsSync(indexPath) && fs_1.default.statSync(indexPath).isFile()) {
                    return indexPath;
                }
            }
        }
    }
    catch {
        // continue
    }
    return null;
}
function createProjectAliasResolver(cwd, resolveFromWorkspace) {
    if (projectAliasCache.has(cwd)) {
        return projectAliasCache.get(cwd) ?? null;
    }
    const configPath = ['tsconfig.json', 'jsconfig.json']
        .map((filename) => path_1.default.join(cwd, filename))
        .find((filename) => fs_1.default.existsSync(filename));
    if (!configPath) {
        projectAliasCache.set(cwd, null);
        return null;
    }
    let compilerOptions = null;
    try {
        const typescriptPath = resolveFromWorkspace('typescript', cwd);
        const ts = require(typescriptPath);
        const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
        if (!readResult.error) {
            compilerOptions = readResult.config?.compilerOptions ?? null;
        }
    }
    catch {
        // fallback to plain JSON parse below
    }
    if (!compilerOptions) {
        try {
            const rawConfig = fs_1.default.readFileSync(configPath, 'utf-8');
            const parsedConfig = JSON.parse(stripJsonComments(rawConfig));
            compilerOptions = parsedConfig.compilerOptions ?? null;
        }
        catch {
            compilerOptions = null;
        }
    }
    const configDir = path_1.default.dirname(configPath);
    const rawPaths = compilerOptions?.paths;
    if (!rawPaths || typeof rawPaths !== 'object') {
        projectAliasCache.set(cwd, null);
        return null;
    }
    const baseDir = path_1.default.resolve(configDir, typeof compilerOptions?.baseUrl === 'string' && compilerOptions.baseUrl.trim()
        ? compilerOptions.baseUrl
        : '.');
    const exactEntries = new Map();
    const wildcardEntries = [];
    for (const [pattern, targetsValue] of Object.entries(rawPaths)) {
        const targets = Array.isArray(targetsValue)
            ? targetsValue.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (targets.length === 0)
            continue;
        if (pattern.includes('*')) {
            const starIndex = pattern.indexOf('*');
            wildcardEntries.push({
                prefix: pattern.slice(0, starIndex),
                suffix: pattern.slice(starIndex + 1),
                targets,
            });
        }
        else {
            exactEntries.set(pattern, targets);
        }
    }
    const resolver = {
        resolve(request) {
            if (!isBareSpecifier(request))
                return null;
            const resolveTargets = (targets, wildcardValue) => {
                for (const targetPattern of targets) {
                    const replacedTarget = wildcardValue === undefined ? targetPattern : targetPattern.replace('*', wildcardValue);
                    const candidate = resolveAliasTargetPath(path_1.default.resolve(baseDir, replacedTarget));
                    if (candidate) {
                        return candidate;
                    }
                }
                return null;
            };
            const exactMatch = exactEntries.get(request);
            if (exactMatch) {
                return resolveTargets(exactMatch);
            }
            for (const entry of wildcardEntries) {
                if (!request.startsWith(entry.prefix) || !request.endsWith(entry.suffix)) {
                    continue;
                }
                const wildcardValue = request.slice(entry.prefix.length, request.length - entry.suffix.length);
                const resolved = resolveTargets(entry.targets, wildcardValue);
                if (resolved) {
                    return resolved;
                }
            }
            return null;
        },
    };
    projectAliasCache.set(cwd, resolver);
    return resolver;
}
