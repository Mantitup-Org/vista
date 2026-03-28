"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installModuleCompileHook = installModuleCompileHook;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const core_1 = require("@swc/core");
const url_1 = require("url");
const runtime_actions_1 = require("./runtime-actions");
const cache_1 = require("./cache");
const CjsModule = require('module');
let compileHookInstalled = false;
let originalCompile = null;
let activeCompileRoots = [];
let activeClientModuleProxyFactory = null;
let activeRuntimeActionsSpecifier = require.resolve('./runtime-actions');
let activeCacheRuntimeSpecifier = require.resolve('./cache');
let activeCacheComponentsEnabled = false;
function normalizeModulePath(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
function stripLeadingCommentsAndWhitespace(source) {
    let remaining = source;
    while (true) {
        const trimmed = remaining.trimStart();
        if (trimmed.startsWith('//')) {
            const newlineIndex = trimmed.indexOf('\n');
            remaining = newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
            continue;
        }
        if (trimmed.startsWith('/*')) {
            const commentEndIndex = trimmed.indexOf('*/');
            if (commentEndIndex === -1) {
                return trimmed;
            }
            remaining = trimmed.slice(commentEndIndex + 2);
            continue;
        }
        return trimmed;
    }
}
function hasDirective(source, directive) {
    const trimmed = stripLeadingCommentsAndWhitespace(source);
    return trimmed.startsWith(`'${directive}'`) || trimmed.startsWith(`"${directive}"`);
}
function containsDirectiveLiteral(source, directive) {
    return source.includes(`'${directive}'`) || source.includes(`"${directive}"`);
}
function readOriginalSource(filename, fallback) {
    try {
        return fs_1.default.readFileSync(filename, 'utf-8');
    }
    catch {
        return fallback;
    }
}
function createDirectiveError(filename, message) {
    return new Error(`[vista:cache] ${path_1.default.basename(filename)}: ${message}`);
}
function isProjectModule(filename, roots) {
    const normalized = normalizeModulePath(filename);
    const matchesRoot = roots.some((root) => {
        const rootPrefix = normalizeModulePath(`${root}${path_1.default.sep}`);
        return normalized.startsWith(rootPrefix);
    });
    const isStandaloneProjectModule = roots.some((root) => {
        const normalizedRoot = normalizeModulePath(root);
        return (normalizedRoot.includes('/.vista/standalone/') &&
            (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)));
    });
    if (!matchesRoot)
        return false;
    if (normalized.includes('/node_modules/'))
        return false;
    if (normalized.includes('/.vista/') && !isStandaloneProjectModule)
        return false;
    if (normalized.includes('/.flash/'))
        return false;
    return /\.[cm]?[jt]sx?$/i.test(normalized);
}
function isStringDirectiveStatement(statement, directive) {
    return (statement?.type === 'ExpressionStatement' &&
        (statement.directive === directive ||
            (statement.expression?.type === 'StringLiteral' &&
                statement.expression?.value === directive)));
}
function hasServerDirectiveInFunctionLike(node) {
    return (node?.body?.type === 'BlockStatement' &&
        Array.isArray(node.body.stmts) &&
        node.body.stmts.length > 0 &&
        isStringDirectiveStatement(node.body.stmts[0], 'use server'));
}
function hasCacheDirectiveInFunctionLike(node) {
    return (node?.body?.type === 'BlockStatement' &&
        Array.isArray(node.body.stmts) &&
        node.body.stmts.length > 0 &&
        isStringDirectiveStatement(node.body.stmts[0], 'use cache'));
}
function createSpan() {
    return { start: 0, end: 0 };
}
function createIdentifier(value) {
    return {
        type: 'Identifier',
        value,
        optional: false,
        ctxt: 0,
        span: createSpan(),
    };
}
function createStringLiteral(value) {
    return {
        type: 'StringLiteral',
        value,
        raw: JSON.stringify(value),
        span: createSpan(),
    };
}
function createRuntimeMemberExpression(runtimeIdentifier, propertyName) {
    return {
        type: 'MemberExpression',
        object: createIdentifier(runtimeIdentifier),
        property: {
            type: 'Identifier',
            value: propertyName,
            span: createSpan(),
        },
        span: createSpan(),
    };
}
function createRegisterReferenceCall(targetExpression, id, exportName = 'default') {
    return {
        type: 'CallExpression',
        ctxt: 0,
        span: createSpan(),
        callee: createRuntimeMemberExpression('__vistaServerActionsRuntime', 'registerInlineServerReference'),
        arguments: [
            { spread: null, expression: targetExpression },
            { spread: null, expression: createStringLiteral(id) },
            { spread: null, expression: createStringLiteral(exportName) },
        ],
        typeArguments: null,
    };
}
function createRegistrationStatement(identifierName, id, exportName = 'default') {
    return {
        type: 'ExpressionStatement',
        span: createSpan(),
        expression: createRegisterReferenceCall(createIdentifier(identifierName), id, exportName),
    };
}
function createUseCacheWrapCall(targetExpression, filename, exportName) {
    return {
        type: 'CallExpression',
        ctxt: 0,
        span: createSpan(),
        callee: createRuntimeMemberExpression('__vistaCacheRuntime', 'wrapModuleUseCacheExport'),
        arguments: [
            { spread: null, expression: targetExpression },
            { spread: null, expression: createStringLiteral(filename) },
            { spread: null, expression: createStringLiteral(exportName) },
        ],
        typeArguments: null,
    };
}
function createUseCacheAssignmentStatement(identifierName, filename, exportName) {
    return {
        type: 'ExpressionStatement',
        span: createSpan(),
        expression: {
            type: 'AssignmentExpression',
            span: createSpan(),
            operator: '=',
            left: createIdentifier(identifierName),
            right: createUseCacheWrapCall(createIdentifier(identifierName), filename, exportName),
        },
    };
}
function createRuntimeRequireDeclaration(runtimeIdentifier, runtimeSpecifier) {
    return {
        type: 'VariableDeclaration',
        span: createSpan(),
        ctxt: 0,
        kind: 'const',
        declare: false,
        declarations: [
            {
                type: 'VariableDeclarator',
                span: createSpan(),
                definite: false,
                id: {
                    ...createIdentifier(runtimeIdentifier),
                    typeAnnotation: null,
                },
                init: {
                    type: 'CallExpression',
                    ctxt: 0,
                    span: createSpan(),
                    callee: createIdentifier('require'),
                    arguments: [
                        {
                            spread: null,
                            expression: createStringLiteral(runtimeSpecifier),
                        },
                    ],
                    typeArguments: null,
                },
            },
        ],
    };
}
function processFunctionLikeDeclaration(statement, filename, state, nextStatements) {
    if (statement?.body?.type !== 'BlockStatement') {
        return false;
    }
    statement.body.stmts = processStatementList(statement.body.stmts || [], filename, state);
    nextStatements.push(statement);
    const identifierName = statement.identifier?.value;
    if (identifierName && hasServerDirectiveInFunctionLike(statement)) {
        const actionId = (0, runtime_actions_1.createInlineServerActionId)(filename, state.nextOrdinal++, identifierName);
        nextStatements.push(createRegistrationStatement(identifierName, actionId, identifierName));
        state.serverActionsTransformed = true;
    }
    if (identifierName && hasCacheDirectiveInFunctionLike(statement)) {
        nextStatements.push(createUseCacheAssignmentStatement(identifierName, filename, identifierName));
        state.useCacheTransformed = true;
    }
    return true;
}
function processStatementList(statements, filename, state) {
    const nextStatements = [];
    for (const statement of statements) {
        if (!statement || typeof statement !== 'object') {
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'FunctionDeclaration') {
            processFunctionLikeDeclaration(statement, filename, state, nextStatements);
            continue;
        }
        if (statement.type === 'ExportDefaultDeclaration' && statement.decl) {
            if (statement.decl.body?.type === 'BlockStatement') {
                statement.decl.body.stmts = processStatementList(statement.decl.body.stmts || [], filename, state);
            }
            else if ((statement.decl.type === 'FunctionExpression' || statement.decl.type === 'ArrowFunctionExpression') &&
                statement.decl.body?.type === 'BlockStatement') {
                statement.decl.body.stmts = processStatementList(statement.decl.body.stmts || [], filename, state);
            }
            if ((statement.decl.type === 'FunctionDeclaration' ||
                statement.decl.type === 'FunctionExpression' ||
                statement.decl.type === 'ArrowFunctionExpression') &&
                hasCacheDirectiveInFunctionLike(statement.decl)) {
                statement.decl = createUseCacheWrapCall(statement.decl, filename, statement.decl.identifier?.value || 'default');
                state.useCacheTransformed = true;
            }
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'ExportDeclaration' && statement.declaration) {
            if (statement.declaration.type === 'FunctionDeclaration') {
                statement.declaration.body.stmts = processStatementList(statement.declaration.body?.stmts || [], filename, state);
                const identifierName = statement.declaration.identifier?.value;
                nextStatements.push(statement);
                if (identifierName && hasServerDirectiveInFunctionLike(statement.declaration)) {
                    const actionId = (0, runtime_actions_1.createInlineServerActionId)(filename, state.nextOrdinal++, identifierName);
                    nextStatements.push(createRegistrationStatement(identifierName, actionId, identifierName));
                    state.serverActionsTransformed = true;
                }
                if (identifierName && hasCacheDirectiveInFunctionLike(statement.declaration)) {
                    nextStatements.push(createUseCacheAssignmentStatement(identifierName, filename, identifierName));
                    state.useCacheTransformed = true;
                }
                continue;
            }
            else if (statement.declaration.type === 'VariableDeclaration' &&
                Array.isArray(statement.declaration.declarations)) {
                for (const declaration of statement.declaration.declarations) {
                    if (!declaration?.init || typeof declaration.init !== 'object') {
                        continue;
                    }
                    const declaratorName = declaration.id?.type === 'Identifier'
                        ? declaration.id.value
                        : `anonymous_${state.nextOrdinal}`;
                    declaration.init = processExpression(declaration.init, filename, state, declaratorName);
                }
            }
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'VariableDeclaration' && Array.isArray(statement.declarations)) {
            for (const declaration of statement.declarations) {
                if (!declaration?.init || typeof declaration.init !== 'object') {
                    continue;
                }
                const declaratorName = declaration.id?.type === 'Identifier'
                    ? declaration.id.value
                    : `anonymous_${state.nextOrdinal}`;
                declaration.init = processExpression(declaration.init, filename, state, declaratorName);
            }
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'ExpressionStatement' && statement.expression) {
            statement.expression = processExpression(statement.expression, filename, state);
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'ReturnStatement' && statement.argument) {
            statement.argument = processExpression(statement.argument, filename, state);
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'BlockStatement') {
            statement.stmts = processStatementList(statement.stmts || [], filename, state);
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'IfStatement') {
            if (statement.consequent?.type === 'BlockStatement') {
                statement.consequent.stmts = processStatementList(statement.consequent.stmts || [], filename, state);
            }
            if (statement.alternate?.type === 'BlockStatement') {
                statement.alternate.stmts = processStatementList(statement.alternate.stmts || [], filename, state);
            }
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'TryStatement') {
            if (statement.block?.type === 'BlockStatement') {
                statement.block.stmts = processStatementList(statement.block.stmts || [], filename, state);
            }
            if (statement.handler?.body?.type === 'BlockStatement') {
                statement.handler.body.stmts = processStatementList(statement.handler.body.stmts || [], filename, state);
            }
            if (statement.finalizer?.type === 'BlockStatement') {
                statement.finalizer.stmts = processStatementList(statement.finalizer.stmts || [], filename, state);
            }
            nextStatements.push(statement);
            continue;
        }
        if (statement.type === 'SwitchStatement' && Array.isArray(statement.cases)) {
            for (const switchCase of statement.cases) {
                switchCase.consequent = processStatementList(switchCase.consequent || [], filename, state);
            }
            nextStatements.push(statement);
            continue;
        }
        if ((statement.type === 'WhileStatement' ||
            statement.type === 'DoWhileStatement' ||
            statement.type === 'ForStatement' ||
            statement.type === 'ForInStatement' ||
            statement.type === 'ForOfStatement') &&
            statement.body?.type === 'BlockStatement') {
            statement.body.stmts = processStatementList(statement.body.stmts || [], filename, state);
            nextStatements.push(statement);
            continue;
        }
        nextStatements.push(statement);
    }
    return nextStatements;
}
function processExpression(expression, filename, state, hint = 'action') {
    if (!expression || typeof expression !== 'object') {
        return expression;
    }
    if (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression') {
        if (expression.body?.type === 'BlockStatement') {
            expression.body.stmts = processStatementList(expression.body.stmts || [], filename, state);
        }
        if (hasServerDirectiveInFunctionLike(expression)) {
            const actionId = (0, runtime_actions_1.createInlineServerActionId)(filename, state.nextOrdinal++, expression.identifier?.value || hint);
            state.serverActionsTransformed = true;
            return createRegisterReferenceCall(expression, actionId, expression.identifier?.value || hint);
        }
        if (hasCacheDirectiveInFunctionLike(expression)) {
            state.useCacheTransformed = true;
            return createUseCacheWrapCall(expression, filename, expression.identifier?.value || hint);
        }
        return expression;
    }
    if (expression.type === 'AssignmentExpression') {
        expression.left = processExpression(expression.left, filename, state, `${hint}_target`);
        expression.right = processExpression(expression.right, filename, state, hint);
        return expression;
    }
    if (expression.type === 'CallExpression') {
        expression.callee = processExpression(expression.callee, filename, state, `${hint}_callee`);
        expression.arguments = (expression.arguments || []).map((argument, index) => argument && argument.expression
            ? {
                ...argument,
                expression: processExpression(argument.expression, filename, state, `${hint}_${index}`),
            }
            : argument);
        return expression;
    }
    if (expression.type === 'NewExpression') {
        expression.callee = processExpression(expression.callee, filename, state, `${hint}_callee`);
        expression.arguments = (expression.arguments || []).map((argument, index) => argument && argument.expression
            ? {
                ...argument,
                expression: processExpression(argument.expression, filename, state, `${hint}_${index}`),
            }
            : argument);
        return expression;
    }
    if (expression.type === 'ArrayExpression') {
        expression.elements = (expression.elements || []).map((element, index) => element && element.expression
            ? {
                ...element,
                expression: processExpression(element.expression, filename, state, `${hint}_${index}`),
            }
            : element);
        return expression;
    }
    if (expression.type === 'MemberExpression') {
        expression.object = processExpression(expression.object, filename, state, `${hint}_object`);
        if (expression.property && expression.computed) {
            expression.property = processExpression(expression.property, filename, state, `${hint}_property`);
        }
        return expression;
    }
    if (expression.type === 'ObjectExpression') {
        expression.properties = (expression.properties || []).map((property) => {
            if (property?.type === 'KeyValueProperty') {
                property.value = processExpression(property.value, filename, state, property.key?.value || property.key?.name || hint);
            }
            return property;
        });
        return expression;
    }
    if (expression.type === 'ObjectPattern') {
        expression.properties = (expression.properties || []).map((property) => {
            if (property?.type === 'KeyValuePatternProperty' && property.value) {
                property.value = processExpression(property.value, filename, state, hint);
            }
            if (property?.type === 'AssignmentPatternProperty' && property.value) {
                property.value = processExpression(property.value, filename, state, hint);
            }
            return property;
        });
        return expression;
    }
    if (expression.type === 'ConditionalExpression') {
        expression.test = processExpression(expression.test, filename, state, hint);
        expression.consequent = processExpression(expression.consequent, filename, state, hint);
        expression.alternate = processExpression(expression.alternate, filename, state, hint);
        return expression;
    }
    if (expression.type === 'SequenceExpression') {
        expression.expressions = (expression.expressions || []).map((entry, index) => processExpression(entry, filename, state, `${hint}_${index}`));
        return expression;
    }
    if (expression.type === 'BinaryExpression' ||
        expression.type === 'LogicalExpression' ||
        expression.type === 'AssignmentPattern') {
        expression.left = processExpression(expression.left, filename, state, `${hint}_left`);
        expression.right = processExpression(expression.right, filename, state, `${hint}_right`);
        return expression;
    }
    if (expression.type === 'UnaryExpression' || expression.type === 'UpdateExpression') {
        expression.argument = processExpression(expression.argument, filename, state, hint);
        return expression;
    }
    if (expression.type === 'AwaitExpression' || expression.type === 'SpreadElement') {
        expression.argument = processExpression(expression.argument, filename, state, hint);
        return expression;
    }
    if (expression.type === 'YieldExpression') {
        if (expression.argument) {
            expression.argument = processExpression(expression.argument, filename, state, hint);
        }
        return expression;
    }
    if (expression.type === 'ParenExpression') {
        expression.expression = processExpression(expression.expression, filename, state, hint);
        return expression;
    }
    if (expression.type === 'TemplateLiteral') {
        expression.expressions = (expression.expressions || []).map((entry, index) => processExpression(entry, filename, state, `${hint}_${index}`));
        return expression;
    }
    if (expression.type === 'TaggedTemplateExpression') {
        expression.tag = processExpression(expression.tag, filename, state, `${hint}_tag`);
        expression.template = processExpression(expression.template, filename, state, `${hint}_template`);
        return expression;
    }
    return expression;
}
function injectRuntimeRequire(moduleAst, runtimeIdentifier, runtimeSpecifier) {
    const body = Array.isArray(moduleAst.body) ? moduleAst.body : [];
    let insertionIndex = 0;
    while (insertionIndex < body.length && isStringDirectiveStatement(body[insertionIndex], 'use strict')) {
        insertionIndex += 1;
    }
    body.splice(insertionIndex, 0, createRuntimeRequireDeclaration(runtimeIdentifier, runtimeSpecifier));
    moduleAst.body = body;
}
function getParserOptions(filename) {
    const extension = path_1.default.extname(filename).toLowerCase();
    const isTypeScript = extension === '.ts' || extension === '.tsx' || extension === '.mts' || extension === '.cts';
    const jsxEnabled = isTypeScript ? extension === '.tsx' : true;
    return {
        syntax: isTypeScript ? 'typescript' : 'ecmascript',
        tsx: isTypeScript ? jsxEnabled : undefined,
        jsx: !isTypeScript ? jsxEnabled : undefined,
    };
}
function transformInlineServerActions(content, filename) {
    if ((!content.includes("'use server'") && !content.includes('"use server"')) &&
        (!content.includes("'use cache'") && !content.includes('"use cache"'))) {
        return content;
    }
    try {
        const moduleAst = (0, core_1.parseSync)(content, getParserOptions(filename));
        const state = {
            serverActionsTransformed: false,
            useCacheTransformed: false,
            nextOrdinal: 0,
        };
        moduleAst.body = processStatementList(moduleAst.body || [], filename, state);
        if (!state.serverActionsTransformed && !state.useCacheTransformed) {
            return content;
        }
        if (state.serverActionsTransformed) {
            injectRuntimeRequire(moduleAst, '__vistaServerActionsRuntime', activeRuntimeActionsSpecifier);
        }
        if (state.useCacheTransformed) {
            injectRuntimeRequire(moduleAst, '__vistaCacheRuntime', activeCacheRuntimeSpecifier);
        }
        return (0, core_1.printSync)(moduleAst).code;
    }
    catch (error) {
        if (process.env.VISTA_DEBUG) {
            console.error(`[vista:compile] Inline action transform failed for ${filename}:`, error);
        }
        return content;
    }
}
function wrapUseCacheModuleExports(moduleExports, filename) {
    if (typeof moduleExports === 'function') {
        const wrappedDefault = (0, cache_1.wrapModuleUseCacheExport)(moduleExports, filename, 'default');
        for (const propertyName of Reflect.ownKeys(moduleExports)) {
            if (propertyName === 'default' ||
                propertyName === 'length' ||
                propertyName === 'name' ||
                propertyName === 'prototype') {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(moduleExports, propertyName);
            const currentValue = descriptor && 'value' in descriptor
                ? descriptor.value
                : descriptor?.get
                    ? descriptor.get.call(moduleExports)
                    : moduleExports[propertyName];
            Object.defineProperty(wrappedDefault, propertyName, {
                configurable: true,
                enumerable: descriptor?.enumerable ?? true,
                writable: true,
                value: (0, cache_1.wrapModuleUseCacheExport)(currentValue, filename, String(propertyName)),
            });
        }
        return wrappedDefault;
    }
    if (!moduleExports || typeof moduleExports !== 'object') {
        return moduleExports;
    }
    const wrappedExports = Object.create(Object.getPrototypeOf(moduleExports));
    for (const exportName of Reflect.ownKeys(moduleExports)) {
        const descriptor = Object.getOwnPropertyDescriptor(moduleExports, exportName);
        if (!descriptor) {
            continue;
        }
        if (exportName === '__esModule') {
            Object.defineProperty(wrappedExports, exportName, descriptor);
            continue;
        }
        const currentValue = 'value' in descriptor
            ? descriptor.value
            : descriptor.get
                ? descriptor.get.call(moduleExports)
                : moduleExports[exportName];
        Object.defineProperty(wrappedExports, exportName, {
            configurable: true,
            enumerable: descriptor.enumerable ?? true,
            writable: true,
            value: (0, cache_1.wrapModuleUseCacheExport)(currentValue, filename, String(exportName)),
        });
    }
    return wrappedExports;
}
function transpileProjectSource(source, filename, fallback) {
    try {
        return (0, core_1.transformSync)(source, {
            filename,
            sourceMaps: 'inline',
            module: {
                type: 'commonjs',
            },
            jsc: {
                target: 'es2020',
                parser: getParserOptions(filename),
                transform: {
                    react: {
                        runtime: 'automatic',
                    },
                },
            },
        }).code;
    }
    catch (error) {
        if (process.env.VISTA_DEBUG) {
            console.error(`[vista:compile] Source transpile failed for ${filename}:`, error);
        }
        return fallback;
    }
}
function installModuleCompileHook(options) {
    activeCompileRoots = Array.from(new Set([options.cwd, path_1.default.resolve(__dirname, '..')].map((entry) => path_1.default.resolve(entry))));
    activeRuntimeActionsSpecifier = require.resolve('./runtime-actions');
    activeCacheRuntimeSpecifier = require.resolve('./cache');
    activeCacheComponentsEnabled = Boolean(options.cacheComponentsEnabled);
    if (options.createClientModuleProxy) {
        activeClientModuleProxyFactory = options.createClientModuleProxy;
    }
    if (compileHookInstalled) {
        return;
    }
    originalCompile = CjsModule.prototype._compile;
    CjsModule.prototype._compile = function compileVistaModule(content, filename) {
        if (!isProjectModule(filename, activeCompileRoots)) {
            return originalCompile.call(this, content, filename);
        }
        const originalSource = readOriginalSource(filename, content);
        const containsUseCacheDirective = containsDirectiveLiteral(originalSource, 'use cache');
        const hasTopLevelUseCacheDirective = hasDirective(originalSource, 'use cache');
        if (containsUseCacheDirective && !activeCacheComponentsEnabled) {
            throw createDirectiveError(filename, 'To use "use cache", enable experimental.cacheComponents.enabled in vista.config.*.');
        }
        if (containsUseCacheDirective && hasDirective(originalSource, 'use client')) {
            throw createDirectiveError(filename, '"use cache" cannot be used in a Client Component. Move the cached logic to a server-only module.');
        }
        if (activeClientModuleProxyFactory && hasDirective(originalSource, 'use client')) {
            const moduleId = (0, url_1.pathToFileURL)(filename).href;
            this.exports = activeClientModuleProxyFactory(moduleId);
            return;
        }
        const sourceToCompile = originalSource || content;
        const transformedSource = transformInlineServerActions(sourceToCompile, filename);
        const compiledContent = transpileProjectSource(transformedSource, filename, content);
        const compileResult = originalCompile.call(this, compiledContent, filename);
        if (hasDirective(originalSource, 'use server')) {
            (0, runtime_actions_1.registerServerActionModule)(this.exports, filename);
        }
        if (hasTopLevelUseCacheDirective) {
            this.exports = wrapUseCacheModuleExports(this.exports, filename);
        }
        return compileResult;
    };
    compileHookInstalled = true;
}
