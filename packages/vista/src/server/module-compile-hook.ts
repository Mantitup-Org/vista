import fs from 'fs';
import path from 'path';
import { parseSync, printSync, transformSync } from '@swc/core';
import { pathToFileURL } from 'url';

import {
  createInlineServerActionId,
  registerServerActionModule,
} from './runtime-actions';
import { wrapModuleUseCacheExport } from './cache';

type ClientModuleProxyFactory = (id: string) => any;

type InlineTransformState = {
  serverActionsTransformed: boolean;
  useCacheTransformed: boolean;
  nextOrdinal: number;
};

const CjsModule = require('module');

let compileHookInstalled = false;
let originalCompile: any = null;
let activeCompileRoots: string[] = [];
let activeClientModuleProxyFactory: ClientModuleProxyFactory | null = null;
let activeRuntimeActionsSpecifier = require.resolve('./runtime-actions');
let activeCacheRuntimeSpecifier = require.resolve('./cache');
let activeCacheComponentsEnabled = false;

function normalizeModulePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function stripLeadingCommentsAndWhitespace(source: string): string {
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

function hasDirective(
  source: string,
  directive: 'use client' | 'use server' | 'use cache'
): boolean {
  const trimmed = stripLeadingCommentsAndWhitespace(source);
  return trimmed.startsWith(`'${directive}'`) || trimmed.startsWith(`"${directive}"`);
}

function containsDirectiveLiteral(
  source: string,
  directive: 'use server' | 'use cache'
): boolean {
  return source.includes(`'${directive}'`) || source.includes(`"${directive}"`);
}

function readOriginalSource(filename: string, fallback: string): string {
  try {
    return fs.readFileSync(filename, 'utf-8');
  } catch {
    return fallback;
  }
}

function createDirectiveError(filename: string, message: string): Error {
  return new Error(`[vista:cache] ${path.basename(filename)}: ${message}`);
}

function isProjectModule(filename: string, roots: string[]): boolean {
  const normalized = normalizeModulePath(filename);
  const matchesRoot = roots.some((root) => {
    const rootPrefix = normalizeModulePath(`${root}${path.sep}`);
    return normalized.startsWith(rootPrefix);
  });
  const isStandaloneProjectModule = roots.some((root) => {
    const normalizedRoot = normalizeModulePath(root);
    return (
      normalizedRoot.includes('/.vista/standalone/') &&
      (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`))
    );
  });

  if (!matchesRoot) return false;
  if (normalized.includes('/node_modules/')) return false;
  if (normalized.includes('/.vista/') && !isStandaloneProjectModule) return false;
  if (normalized.includes('/.flash/')) return false;

  return /\.[cm]?[jt]sx?$/i.test(normalized);
}

function isStringDirectiveStatement(statement: any, directive: string): boolean {
  return (
    statement?.type === 'ExpressionStatement' &&
    (statement.directive === directive ||
      (statement.expression?.type === 'StringLiteral' &&
        statement.expression?.value === directive))
  );
}

/**
 * SWC labels the body of a function/method/arrow as `FunctionBody`, while a bare
 * block (`{ ... }`, loop/if/try bodies) stays `BlockStatement`. Older versions
 * reported `BlockStatement` for both, so accept either shape here - otherwise
 * every function-body walk silently no-ops and inline `'use server'` /
 * `'use cache'` directives never get transformed.
 */
function isFunctionBodyBlock(node: any): boolean {
  return node?.type === 'BlockStatement' || node?.type === 'FunctionBody';
}

function hasServerDirectiveInFunctionLike(node: any): boolean {
  return (
    isFunctionBodyBlock(node?.body) &&
    Array.isArray(node.body.stmts) &&
    node.body.stmts.length > 0 &&
    isStringDirectiveStatement(node.body.stmts[0], 'use server')
  );
}

function hasCacheDirectiveInFunctionLike(node: any): boolean {
  return (
    isFunctionBodyBlock(node?.body) &&
    Array.isArray(node.body.stmts) &&
    node.body.stmts.length > 0 &&
    isStringDirectiveStatement(node.body.stmts[0], 'use cache')
  );
}

function createSpan() {
  return { start: 0, end: 0 };
}

function createIdentifier(value: string) {
  return {
    type: 'Identifier',
    value,
    optional: false,
    ctxt: 0,
    span: createSpan(),
  };
}

function createStringLiteral(value: string) {
  return {
    type: 'StringLiteral',
    value,
    raw: JSON.stringify(value),
    span: createSpan(),
  };
}

function createRuntimeMemberExpression(runtimeIdentifier: string, propertyName: string) {
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

function createRegisterReferenceCall(targetExpression: any, id: string, exportName = 'default') {
  return {
    type: 'CallExpression',
    ctxt: 0,
    span: createSpan(),
    callee: createRuntimeMemberExpression(
      '__vistaServerActionsRuntime',
      'registerInlineServerReference'
    ),
    arguments: [
      { spread: null, expression: targetExpression },
      { spread: null, expression: createStringLiteral(id) },
      { spread: null, expression: createStringLiteral(exportName) },
    ],
    typeArguments: null,
  };
}

function createRegistrationStatement(identifierName: string, id: string, exportName = 'default') {
  return {
    type: 'ExpressionStatement',
    span: createSpan(),
    expression: createRegisterReferenceCall(createIdentifier(identifierName), id, exportName),
  };
}

function createUseCacheWrapCall(targetExpression: any, filename: string, exportName: string) {
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

function createUseCacheAssignmentStatement(
  identifierName: string,
  filename: string,
  exportName: string
) {
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

function createRuntimeRequireDeclaration(runtimeIdentifier: string, runtimeSpecifier: string) {
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

function processFunctionLikeDeclaration(
  statement: any,
  filename: string,
  state: InlineTransformState,
  nextStatements: any[]
): boolean {
  if (!isFunctionBodyBlock(statement?.body)) {
    // Bodyless declarations (TS overload signatures, `declare function`) still
    // have to survive into the emitted module.
    nextStatements.push(statement);
    return false;
  }

  statement.body.stmts = processStatementList(statement.body.stmts || [], filename, state);
  nextStatements.push(statement);

  const identifierName = statement.identifier?.value;
  if (identifierName && hasServerDirectiveInFunctionLike(statement)) {
    const actionId = createInlineServerActionId(filename, state.nextOrdinal++, identifierName);
    nextStatements.push(createRegistrationStatement(identifierName, actionId, identifierName));
    state.serverActionsTransformed = true;
  }

  if (identifierName && hasCacheDirectiveInFunctionLike(statement)) {
    nextStatements.push(createUseCacheAssignmentStatement(identifierName, filename, identifierName));
    state.useCacheTransformed = true;
  }

  return true;
}

function processStatementList(statements: any[], filename: string, state: InlineTransformState): any[] {
  const nextStatements: any[] = [];

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
      if (isFunctionBodyBlock(statement.decl.body)) {
        statement.decl.body.stmts = processStatementList(statement.decl.body.stmts || [], filename, state);
      } else if (
        (statement.decl.type === 'FunctionExpression' || statement.decl.type === 'ArrowFunctionExpression') &&
        isFunctionBodyBlock(statement.decl.body)
      ) {
        statement.decl.body.stmts = processStatementList(statement.decl.body.stmts || [], filename, state);
      }

      if (
        (statement.decl.type === 'FunctionDeclaration' ||
          statement.decl.type === 'FunctionExpression' ||
          statement.decl.type === 'ArrowFunctionExpression') &&
        hasCacheDirectiveInFunctionLike(statement.decl)
      ) {
        statement.decl = createUseCacheWrapCall(
          statement.decl,
          filename,
          statement.decl.identifier?.value || 'default'
        );
        state.useCacheTransformed = true;
      }
      nextStatements.push(statement);
      continue;
    }

    if (statement.type === 'ExportDeclaration' && statement.declaration) {
      if (statement.declaration.type === 'FunctionDeclaration') {
        statement.declaration.body.stmts = processStatementList(
          statement.declaration.body?.stmts || [],
          filename,
          state
        );
        const identifierName = statement.declaration.identifier?.value;
        nextStatements.push(statement);
        if (identifierName && hasServerDirectiveInFunctionLike(statement.declaration)) {
          const actionId = createInlineServerActionId(filename, state.nextOrdinal++, identifierName);
          nextStatements.push(createRegistrationStatement(identifierName, actionId, identifierName));
          state.serverActionsTransformed = true;
        }
        if (identifierName && hasCacheDirectiveInFunctionLike(statement.declaration)) {
          nextStatements.push(
            createUseCacheAssignmentStatement(identifierName, filename, identifierName)
          );
          state.useCacheTransformed = true;
        }
        continue;
      } else if (
        statement.declaration.type === 'VariableDeclaration' &&
        Array.isArray(statement.declaration.declarations)
      ) {
        for (const declaration of statement.declaration.declarations) {
          if (!declaration?.init || typeof declaration.init !== 'object') {
            continue;
          }
          const declaratorName =
            declaration.id?.type === 'Identifier'
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
        const declaratorName =
          declaration.id?.type === 'Identifier'
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
        statement.handler.body.stmts = processStatementList(
          statement.handler.body.stmts || [],
          filename,
          state
        );
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

    if (
      (statement.type === 'WhileStatement' ||
        statement.type === 'DoWhileStatement' ||
        statement.type === 'ForStatement' ||
        statement.type === 'ForInStatement' ||
        statement.type === 'ForOfStatement') &&
      statement.body?.type === 'BlockStatement'
    ) {
      statement.body.stmts = processStatementList(statement.body.stmts || [], filename, state);
      nextStatements.push(statement);
      continue;
    }

    nextStatements.push(statement);
  }

  return nextStatements;
}

function processExpression(
  expression: any,
  filename: string,
  state: InlineTransformState,
  hint = 'action'
): any {
  if (!expression || typeof expression !== 'object') {
    return expression;
  }

  if (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression') {
    if (isFunctionBodyBlock(expression.body)) {
      expression.body.stmts = processStatementList(expression.body.stmts || [], filename, state);
    }

    if (hasServerDirectiveInFunctionLike(expression)) {
      const actionId = createInlineServerActionId(
        filename,
        state.nextOrdinal++,
        expression.identifier?.value || hint
      );
      state.serverActionsTransformed = true;
      return createRegisterReferenceCall(
        expression,
        actionId,
        expression.identifier?.value || hint
      );
    }

    if (hasCacheDirectiveInFunctionLike(expression)) {
      state.useCacheTransformed = true;
      return createUseCacheWrapCall(
        expression,
        filename,
        expression.identifier?.value || hint
      );
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
    expression.arguments = (expression.arguments || []).map((argument: any, index: number) =>
      argument && argument.expression
        ? {
            ...argument,
            expression: processExpression(
              argument.expression,
              filename,
              state,
              `${hint}_${index}`
            ),
          }
        : argument
    );
    return expression;
  }

  if (expression.type === 'NewExpression') {
    expression.callee = processExpression(expression.callee, filename, state, `${hint}_callee`);
    expression.arguments = (expression.arguments || []).map((argument: any, index: number) =>
      argument && argument.expression
        ? {
            ...argument,
            expression: processExpression(
              argument.expression,
              filename,
              state,
              `${hint}_${index}`
            ),
          }
        : argument
    );
    return expression;
  }

  if (expression.type === 'ArrayExpression') {
    expression.elements = (expression.elements || []).map((element: any, index: number) =>
      element && element.expression
        ? {
            ...element,
            expression: processExpression(element.expression, filename, state, `${hint}_${index}`),
          }
        : element
    );
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
    expression.properties = (expression.properties || []).map((property: any) => {
      if (property?.type === 'KeyValueProperty') {
        property.value = processExpression(
          property.value,
          filename,
          state,
          property.key?.value || property.key?.name || hint
        );
      }
      return property;
    });
    return expression;
  }

  if (expression.type === 'ObjectPattern') {
    expression.properties = (expression.properties || []).map((property: any) => {
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
    expression.expressions = (expression.expressions || []).map((entry: any, index: number) =>
      processExpression(entry, filename, state, `${hint}_${index}`)
    );
    return expression;
  }

  if (
    expression.type === 'BinaryExpression' ||
    expression.type === 'LogicalExpression' ||
    expression.type === 'AssignmentPattern'
  ) {
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
    expression.expressions = (expression.expressions || []).map((entry: any, index: number) =>
      processExpression(entry, filename, state, `${hint}_${index}`)
    );
    return expression;
  }

  if (expression.type === 'TaggedTemplateExpression') {
    expression.tag = processExpression(expression.tag, filename, state, `${hint}_tag`);
    expression.template = processExpression(expression.template, filename, state, `${hint}_template`);
    return expression;
  }

  return expression;
}

function injectRuntimeRequire(
  moduleAst: any,
  runtimeIdentifier: string,
  runtimeSpecifier: string
): void {
  const body = Array.isArray(moduleAst.body) ? moduleAst.body : [];
  let insertionIndex = 0;

  while (insertionIndex < body.length && isStringDirectiveStatement(body[insertionIndex], 'use strict')) {
    insertionIndex += 1;
  }

  body.splice(
    insertionIndex,
    0,
    createRuntimeRequireDeclaration(runtimeIdentifier, runtimeSpecifier)
  );
  moduleAst.body = body;
}

function getParserOptions(filename: string): any {
  const extension = path.extname(filename).toLowerCase();
  const isTypeScript = extension === '.ts' || extension === '.tsx' || extension === '.mts' || extension === '.cts';
  const jsxEnabled = isTypeScript ? extension === '.tsx' : true;

  return {
    syntax: isTypeScript ? 'typescript' : 'ecmascript',
    tsx: isTypeScript ? jsxEnabled : undefined,
    jsx: !isTypeScript ? jsxEnabled : undefined,
  };
}

function transformInlineServerActions(content: string, filename: string): string {
  if (
    (!content.includes("'use server'") && !content.includes('"use server"')) &&
    (!content.includes("'use cache'") && !content.includes('"use cache"'))
  ) {
    return content;
  }

  try {
    const moduleAst = parseSync(content, getParserOptions(filename)) as any;

    const state: InlineTransformState = {
      serverActionsTransformed: false,
      useCacheTransformed: false,
      nextOrdinal: 0,
    };

    moduleAst.body = processStatementList(moduleAst.body || [], filename, state);
    if (!state.serverActionsTransformed && !state.useCacheTransformed) {
      return content;
    }

    if (state.serverActionsTransformed) {
      injectRuntimeRequire(
        moduleAst,
        '__vistaServerActionsRuntime',
        activeRuntimeActionsSpecifier
      );
    }
    if (state.useCacheTransformed) {
      injectRuntimeRequire(moduleAst, '__vistaCacheRuntime', activeCacheRuntimeSpecifier);
    }
    return printSync(moduleAst).code;
  } catch (error) {
    if (process.env.VISTA_DEBUG) {
      console.error(`[vista:compile] Inline action transform failed for ${filename}:`, error);
    }
    return content;
  }
}

function wrapUseCacheModuleExports(moduleExports: any, filename: string): any {
  if (typeof moduleExports === 'function') {
    const wrappedDefault = wrapModuleUseCacheExport(moduleExports, filename, 'default');
    for (const propertyName of Reflect.ownKeys(moduleExports)) {
      if (
        propertyName === 'default' ||
        propertyName === 'length' ||
        propertyName === 'name' ||
        propertyName === 'prototype'
      ) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(moduleExports, propertyName);
      const currentValue =
        descriptor && 'value' in descriptor
          ? descriptor.value
          : descriptor?.get
            ? descriptor.get.call(moduleExports)
            : (moduleExports as any)[propertyName];

      Object.defineProperty(wrappedDefault, propertyName, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        writable: true,
        value: wrapModuleUseCacheExport(currentValue, filename, String(propertyName)),
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

    const currentValue =
      'value' in descriptor
        ? descriptor.value
        : descriptor.get
          ? descriptor.get.call(moduleExports)
          : (moduleExports as any)[exportName];

    Object.defineProperty(wrappedExports, exportName, {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      writable: true,
      value: wrapModuleUseCacheExport(
      currentValue,
      filename,
      String(exportName)
    ),
    });
  }

  return wrappedExports;
}

function transpileProjectSource(source: string, filename: string, fallback: string): string {
  try {
    return transformSync(source, {
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
  } catch (error) {
    if (process.env.VISTA_DEBUG) {
      console.error(`[vista:compile] Source transpile failed for ${filename}:`, error);
    }
    return fallback;
  }
}

export function installModuleCompileHook(options: {
  cwd: string;
  createClientModuleProxy?: ClientModuleProxyFactory;
  cacheComponentsEnabled?: boolean;
}): void {
  activeCompileRoots = Array.from(
    new Set([options.cwd, path.resolve(__dirname, '..')].map((entry) => path.resolve(entry)))
  );
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
  CjsModule.prototype._compile = function compileVistaModule(content: string, filename: string) {
    if (!isProjectModule(filename, activeCompileRoots)) {
      return originalCompile.call(this, content, filename);
    }

    const originalSource = readOriginalSource(filename, content);
    const containsUseCacheDirective = containsDirectiveLiteral(originalSource, 'use cache');
    const hasTopLevelUseCacheDirective = hasDirective(originalSource, 'use cache');
    if (containsUseCacheDirective && !activeCacheComponentsEnabled) {
      throw createDirectiveError(
        filename,
        'To use "use cache", enable experimental.cacheComponents.enabled in vista.config.*.'
      );
    }

    if (containsUseCacheDirective && hasDirective(originalSource, 'use client')) {
      throw createDirectiveError(
        filename,
        '"use cache" cannot be used in a Client Component. Move the cached logic to a server-only module.'
      );
    }

    if (activeClientModuleProxyFactory && hasDirective(originalSource, 'use client')) {
      const moduleId = pathToFileURL(filename).href;
      this.exports = activeClientModuleProxyFactory(moduleId);
      return;
    }

    const sourceToCompile = originalSource || content;
    const transformedSource = transformInlineServerActions(sourceToCompile, filename);
    const compiledContent = transpileProjectSource(transformedSource, filename, content);
    const compileResult = originalCompile.call(this, compiledContent, filename);

    if (hasDirective(originalSource, 'use server')) {
      registerServerActionModule(this.exports, filename);
    }

    if (hasTopLevelUseCacheDirective) {
      this.exports = wrapUseCacheModuleExports(this.exports, filename);
    }

    return compileResult;
  };

  compileHookInstalled = true;
}
