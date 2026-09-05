"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGenerateCommand = runGenerateCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function toKebabCase(value) {
    return value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}
function toPascalCase(value) {
    return toKebabCase(value)
        .split('-')
        .filter(Boolean)
        .map((segment) => segment[0].toUpperCase() + segment.slice(1))
        .join('');
}
function toCamelCase(value) {
    const pascal = toPascalCase(value);
    return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : '';
}
function ensureDirectory(targetDir) {
    fs_1.default.mkdirSync(targetDir, { recursive: true });
}
function writeFileIfMissing(baseDir, relativePath, content) {
    const absolutePath = path_1.default.join(baseDir, relativePath);
    if (fs_1.default.existsSync(absolutePath)) {
        return { path: absolutePath, created: false };
    }
    ensureDirectory(path_1.default.dirname(absolutePath));
    fs_1.default.writeFileSync(absolutePath, content, 'utf8');
    return { path: absolutePath, created: true };
}
function renderAgent(kebabName) {
    const camelName = toCamelCase(kebabName);
    return [
        "import { agent, tool } from '@vistagenic/vista/ai';",
        '',
        `export const ${camelName}Agent = agent({`,
        `  name: '${kebabName}',`,
        "  model: process.env.VISTA_AI_MODEL || 'openai:gpt-4o',",
        `  systemPrompt: 'You are a helpful AI assistant for ${kebabName}.',`,
        '  tools: [',
        '    tool({',
        "      name: 'ping',",
        "      description: 'Check agent connectivity',",
        '      execute: async () => ({ status: \"ok\", time: new Date().toISOString() }),',
        '    }),',
        '  ],',
        '  memory: true,',
        '});',
        '',
    ].join('\n');
}
function renderAgentRoute(kebabName) {
    const camelName = toCamelCase(kebabName);
    return [
        `import { ${camelName}Agent } from '../../agents/${kebabName}/agent';`,
        '',
        'export async function POST(req: Request) {',
        '  const { prompt, messages, sessionId } = await req.json();',
        `  const stream = ${camelName}Agent.stream({ prompt, messages, sessionId });`,
        '  return stream.toDataStreamResponse();',
        '}',
        '',
    ].join('\n');
}
function findMatchingBrace(source, openBraceIndex) {
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
        const char = source[i];
        if (char === '{')
            depth++;
        if (char === '}')
            depth--;
        if (depth === 0)
            return i;
    }
    return -1;
}
function insertTypedApiConfigIntoObject(source, objectStartIndex) {
    const openBraceIndex = source.indexOf('{', objectStartIndex);
    if (openBraceIndex < 0) {
        return null;
    }
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
    if (closeBraceIndex < 0) {
        return null;
    }
    const before = source.slice(0, closeBraceIndex);
    const after = source.slice(closeBraceIndex);
    const insertion = `\n  experimental: {\n    typedApi: {\n      enabled: true,\n    },\n  },`;
    return `${before}${insertion}${after}`;
}
function ensureTypedApiEnabledInConfig(cwd) {
    const tsPath = path_1.default.join(cwd, 'vista.config.ts');
    const jsPath = path_1.default.join(cwd, 'vista.config.js');
    if (!fs_1.default.existsSync(tsPath) && !fs_1.default.existsSync(jsPath)) {
        const configSource = [
            'const config = {',
            '  experimental: {',
            '    typedApi: {',
            '      enabled: true,',
            '    },',
            '  },',
            '};',
            '',
            'export default config;',
            '',
        ].join('\n');
        fs_1.default.writeFileSync(tsPath, configSource, 'utf8');
        return 'created';
    }
    const targetPath = fs_1.default.existsSync(tsPath) ? tsPath : jsPath;
    const source = fs_1.default.readFileSync(targetPath, 'utf8');
    if (/\btypedApi\b/.test(source) && /\benabled\s*:\s*true\b/.test(source)) {
        return 'unchanged';
    }
    const constConfigIndex = source.indexOf('const config');
    if (constConfigIndex >= 0) {
        const updated = insertTypedApiConfigIntoObject(source, constConfigIndex);
        if (updated) {
            fs_1.default.writeFileSync(targetPath, updated, 'utf8');
            return 'updated';
        }
    }
    const exportDefaultIndex = source.indexOf('export default');
    if (exportDefaultIndex >= 0) {
        const updated = insertTypedApiConfigIntoObject(source, exportDefaultIndex);
        if (updated) {
            fs_1.default.writeFileSync(targetPath, updated, 'utf8');
            return 'updated';
        }
    }
    return 'manual';
}
function renderApiInitEntrypoint() {
    return [
        "import { vstack } from 'vista/stack';",
        "import { createRootRouter } from './routers';",
        '',
        'const v = vstack.init();',
        '',
        'export const router = createRootRouter(v);',
        '',
    ].join('\n');
}
function renderRootRouter() {
    return [
        "import type { VStackInstance } from 'vista/stack';",
        "import { healthProcedure } from '../procedures/health';",
        '',
        'export function createRootRouter(v: VStackInstance<any, any>) {',
        '  return v.router({',
        '    health: healthProcedure(v),',
        '  });',
        '}',
        '',
    ].join('\n');
}
function renderProcedure(name, method) {
    const safeName = toCamelCase(name);
    const functionName = `${safeName}Procedure`;
    const procedureMethod = method === 'post' ? 'mutation' : 'query';
    const sampleResult = method === 'post'
        ? "    ok: true,\n    message: 'Mutation executed',"
        : "    ok: true,\n    message: 'Query executed',";
    return [
        "import type { VStackInstance } from 'vista/stack';",
        '',
        `export function ${functionName}(v: VStackInstance<any, any>) {`,
        `  return v.procedure.${procedureMethod}(() => ({`,
        sampleResult,
        '  }));',
        '}',
        '',
    ].join('\n');
}
function renderRouter(name) {
    const pascal = toPascalCase(name);
    const camel = toCamelCase(name);
    return [
        "import type { VStackInstance } from 'vista/stack';",
        '',
        `export function create${pascal}Router(v: VStackInstance<any, any>) {`,
        '  return v.router({',
        `    ${camel}: v.procedure.query(() => ({`,
        `      route: '${toKebabCase(name)}',`,
        '      ok: true,',
        '    })),',
        '  });',
        '}',
        '',
    ].join('\n');
}
function printGenerateUsage(log) {
    log('Vista generator usage:');
    log('  vista g api-init');
    log('  vista g router <name>');
    log('  vista g procedure <name> [get|post]');
    log('  vista g agent <name>');
}
async function runGenerateCommand(args, options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const log = options.log ?? console.log;
    const error = options.error ?? console.error;
    const command = (args[0] || '').toLowerCase();
    if (!command || !['api-init', 'router', 'procedure', 'agent'].includes(command)) {
        printGenerateUsage(log);
        return 1;
    }
    if (command === 'api-init') {
        const writes = [
            writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'typed.ts'), renderApiInitEntrypoint()),
            writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'routers', 'index.ts'), renderRootRouter()),
            writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'procedures', 'health.ts'), renderProcedure('health', 'get')),
        ];
        const configState = ensureTypedApiEnabledInConfig(cwd);
        writes.forEach((result) => {
            const relativePath = path_1.default.relative(cwd, result.path).replace(/\\/g, '/');
            log(`${result.created ? 'created' : 'skipped'} ${relativePath}`);
        });
        if (configState === 'created') {
            log('created vista.config.ts with experimental.typedApi.enabled = true');
        }
        else if (configState === 'updated') {
            log('updated vista.config.* to enable experimental typed API');
        }
        else if (configState === 'unchanged') {
            log('typed API config already enabled');
        }
        else {
            error('Could not update vista.config automatically. Please enable experimental.typedApi.enabled manually.');
            return 1;
        }
        return 0;
    }
    if (command === 'router') {
        const rawName = args[1];
        if (!rawName) {
            error('Missing router name. Example: vista g router users');
            return 1;
        }
        const safeName = toKebabCase(rawName);
        if (!safeName) {
            error(`Invalid router name "${rawName}".`);
            return 1;
        }
        const result = writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'routers', `${safeName}.ts`), renderRouter(safeName));
        const relativePath = path_1.default.relative(cwd, result.path).replace(/\\/g, '/');
        log(`${result.created ? 'created' : 'skipped'} ${relativePath}`);
        return 0;
    }
    if (command === 'procedure') {
        const rawName = args[1];
        if (!rawName) {
            error('Missing procedure name. Example: vista g procedure list-users get');
            return 1;
        }
        const methodArg = (args[2] || 'get').toLowerCase();
        if (methodArg !== 'get' && methodArg !== 'post') {
            error(`Invalid procedure method "${methodArg}". Use "get" or "post".`);
            return 1;
        }
        const safeName = toKebabCase(rawName);
        if (!safeName) {
            error(`Invalid procedure name "${rawName}".`);
            return 1;
        }
        const result = writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'procedures', `${safeName}.ts`), renderProcedure(safeName, methodArg));
        const relativePath = path_1.default.relative(cwd, result.path).replace(/\\/g, '/');
        log(`${result.created ? 'created' : 'skipped'} ${relativePath}`);
        return 0;
    }
    if (command === 'agent') {
        const rawName = args[1];
        if (!rawName) {
            error('Missing agent name. Example: vista g agent support');
            return 1;
        }
        const safeName = toKebabCase(rawName);
        if (!safeName) {
            error(`Invalid agent name "${rawName}".`);
            return 1;
        }
        const agentFile = writeFileIfMissing(cwd, path_1.default.join('app', 'agents', safeName, 'agent.ts'), renderAgent(safeName));
        const routeFile = writeFileIfMissing(cwd, path_1.default.join('app', 'api', 'agents', safeName, 'route.ts'), renderAgentRoute(safeName));
        [agentFile, routeFile].forEach((res) => {
            const relativePath = path_1.default.relative(cwd, res.path).replace(/\\/g, '/');
            log(`${res.created ? 'created' : 'skipped'} ${relativePath}`);
        });
        return 0;
    }
    printGenerateUsage(log);
    return 1;
}
