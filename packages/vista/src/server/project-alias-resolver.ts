import fs from 'fs';
import path from 'path';

export interface ProjectAliasResolver {
  resolve: (request: string) => string | null;
}

const projectAliasCache = new Map<string, ProjectAliasResolver | null>();

function stripJsonComments(input: string): string {
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

function isBareSpecifier(request: string): boolean {
  if (!request) return false;
  if (request.startsWith('.') || request.startsWith('/')) return false;
  return !/^[A-Za-z]:[\\/]/.test(request);
}

function resolveAliasTargetPath(candidatePath: string): string | null {
  const resolvedBase = path.resolve(candidatePath);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

  const directCandidates = path.extname(resolvedBase)
    ? [resolvedBase]
    : [resolvedBase, ...extensions.map((extension) => `${resolvedBase}${extension}`)];

  for (const candidate of directCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }

  try {
    if (fs.existsSync(resolvedBase) && fs.statSync(resolvedBase).isDirectory()) {
      const packageJsonPath = path.join(resolvedBase, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
            main?: string;
          };
          if (packageJson.main) {
            const packageMainPath = resolveAliasTargetPath(
              path.join(resolvedBase, packageJson.main)
            );
            if (packageMainPath) return packageMainPath;
          }
        } catch {
          // ignore invalid package.json while resolving alias target
        }
      }

      for (const extension of extensions) {
        const indexPath = path.join(resolvedBase, `index${extension}`);
        if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
          return indexPath;
        }
      }
    }
  } catch {
    // continue
  }

  return null;
}

export function createProjectAliasResolver(
  cwd: string,
  resolveFromWorkspace: (specifier: string, cwd: string) => string
): ProjectAliasResolver | null {
  if (projectAliasCache.has(cwd)) {
    return projectAliasCache.get(cwd) ?? null;
  }

  const configPath = ['tsconfig.json', 'jsconfig.json']
    .map((filename) => path.join(cwd, filename))
    .find((filename) => fs.existsSync(filename));

  if (!configPath) {
    projectAliasCache.set(cwd, null);
    return null;
  }

  let compilerOptions: Record<string, any> | null = null;
  try {
    const typescriptPath = resolveFromWorkspace('typescript', cwd);
    const ts = require(typescriptPath) as typeof import('typescript');
    const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
    if (!readResult.error) {
      compilerOptions = readResult.config?.compilerOptions ?? null;
    }
  } catch {
    // fallback to plain JSON parse below
  }

  if (!compilerOptions) {
    try {
      const rawConfig = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(stripJsonComments(rawConfig)) as {
        compilerOptions?: Record<string, any>;
      };
      compilerOptions = parsedConfig.compilerOptions ?? null;
    } catch {
      compilerOptions = null;
    }
  }

  const configDir = path.dirname(configPath);
  const rawPaths = compilerOptions?.paths;
  if (!rawPaths || typeof rawPaths !== 'object') {
    projectAliasCache.set(cwd, null);
    return null;
  }

  const baseDir = path.resolve(
    configDir,
    typeof compilerOptions?.baseUrl === 'string' && compilerOptions.baseUrl.trim()
      ? compilerOptions.baseUrl
      : '.'
  );

  const exactEntries = new Map<string, string[]>();
  const wildcardEntries: Array<{
    prefix: string;
    suffix: string;
    targets: string[];
  }> = [];

  for (const [pattern, targetsValue] of Object.entries(rawPaths)) {
    const targets = Array.isArray(targetsValue)
      ? targetsValue.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : [];
    if (targets.length === 0) continue;

    if (pattern.includes('*')) {
      const starIndex = pattern.indexOf('*');
      wildcardEntries.push({
        prefix: pattern.slice(0, starIndex),
        suffix: pattern.slice(starIndex + 1),
        targets,
      });
    } else {
      exactEntries.set(pattern, targets);
    }
  }

  const resolver: ProjectAliasResolver = {
    resolve(request: string): string | null {
      if (!isBareSpecifier(request)) return null;

      const resolveTargets = (targets: string[], wildcardValue?: string): string | null => {
        for (const targetPattern of targets) {
          const replacedTarget =
            wildcardValue === undefined ? targetPattern : targetPattern.replace('*', wildcardValue);
          const candidate = resolveAliasTargetPath(path.resolve(baseDir, replacedTarget));
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
        const wildcardValue = request.slice(
          entry.prefix.length,
          request.length - entry.suffix.length
        );
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
