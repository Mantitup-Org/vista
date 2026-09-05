#!/usr/bin/env node

/**
 * Regression guard for inline `'use server'` / `'use cache'` directives.
 *
 * The `/conformance/actions-inline` RSC conformance case regressed when
 * @swc/core started labelling function bodies `FunctionBody` instead of
 * `BlockStatement`: every function-body walk in the module compile hook
 * silently no-opped, so nested `'use server'` functions were never registered
 * as server references and the action request failed with HTTP 500
 * ("Functions cannot be passed directly to Client Components...").
 *
 * These checks are cheap (no dev server, no Rust toolchain) and fail loudly on
 * the transform itself, instead of surfacing as a 500 deep inside the
 * conformance suite.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function registerTypeScriptRuntime() {
  const searchRoots = [repoRoot, path.join(repoRoot, 'packages', 'vista')];
  const resolveFromWorkspace = (specifier) => {
    for (const root of searchRoots) {
      try {
        return require.resolve(specifier, { paths: [root] });
      } catch {}
    }

    throw new Error(`Unable to resolve ${specifier}`);
  };

  try {
    require(resolveFromWorkspace('@swc-node/register'));
    return;
  } catch {}

  try {
    require(resolveFromWorkspace('ts-node/register/transpile-only'));
    return;
  } catch {}

  try {
    require(resolveFromWorkspace('ts-node')).register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        jsx: 'react-jsx',
        moduleResolution: 'node16',
        esModuleInterop: true,
      },
    });
    return;
  } catch {}

  throw new Error('No TypeScript runtime found for inline server action tests.');
}

registerTypeScriptRuntime();

const vistaSrc = path.join(repoRoot, 'packages', 'vista', 'src');
const { installModuleCompileHook } = require(path.join(vistaSrc, 'server', 'module-compile-hook.ts'));
const actionRuntime = require(path.join(vistaSrc, 'server', 'runtime-actions.ts'));
const { generateServerManifest } = require(path.join(vistaSrc, 'build', 'rsc', 'server-manifest.ts'));
const swc = require(
  require.resolve('@swc/core', { paths: [path.join(repoRoot, 'packages', 'vista'), repoRoot] })
);

/**
 * The compile hook only recognises a function body by its AST node type, so
 * pin down the shapes @swc/core actually emits. If a future @swc/core renames
 * them again this assertion fails first, with a message that points at the fix.
 */
function assertFunctionBodyNodeTypesAreHandled() {
  const accepted = new Set(['BlockStatement', 'FunctionBody']);
  const ast = swc.parseSync(
    [
      'function declared() {}',
      'const expression = function () {};',
      'const arrow = () => {};',
    ].join('\n'),
    { syntax: 'ecmascript' }
  );

  const bodies = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      bodies.push(node.body?.type);
    }
    for (const key of Object.keys(node)) {
      if (key !== 'span') walk(node[key]);
    }
  };
  walk(ast.body);

  assert.equal(bodies.length, 3, 'Expected three function-like nodes in the probe source');
  for (const bodyType of bodies) {
    assert.ok(
      accepted.has(bodyType),
      `@swc/core emits function bodies as "${bodyType}", which the module compile hook does not ` +
        'recognise. Add it to isFunctionBodyBlock() in packages/vista/src/server/module-compile-hook.ts.'
    );
  }
}

function writeFixture(appDir) {
  const routeDir = path.join(appDir, 'conformance', 'actions-inline');
  fs.mkdirSync(routeDir, { recursive: true });

  // Mirrors bench/app-router-server/app/conformance/actions-inline/page.js:
  // an inline action declared inside the default-exported Server Component and
  // handed to a Client Component as a prop.
  const pagePath = path.join(routeDir, 'page.js');
  fs.writeFileSync(
    pagePath,
    [
      "export const dynamic = 'force-dynamic'",
      '',
      'export default function InlineActionsPage() {',
      '  async function inlineEcho(value) {',
      "    'use server'",
      '',
      "    return { ok: true, kind: 'inline', value: `echo-${value}` }",
      '  }',
      '',
      '  return { action: inlineEcho }',
      '}',
      '',
    ].join('\n'),
    'utf8'
  );

  // Two inline actions in one module: locks the ordinal numbering that the
  // build manifest and the runtime have to agree on.
  const orderedPath = path.join(routeDir, 'ordered.js');
  fs.writeFileSync(
    orderedPath,
    [
      'export function buildOrderedActions() {',
      '  async function firstAction(value) {',
      "    'use server'",
      '    return value',
      '  }',
      '',
      '  const secondAction = async (value) => {',
      "    'use server'",
      '    return value',
      '  }',
      '',
      '  return { firstAction, secondAction }',
      '}',
      '',
    ].join('\n'),
    'utf8'
  );

  return { pagePath, orderedPath };
}

function main() {
  assertFunctionBodyNodeTypesAreHandled();

  const projectDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-inline-server-actions-'));
  try {
    const appDir = path.join(projectDir, 'app');
    const { pagePath, orderedPath } = writeFixture(appDir);

    installModuleCompileHook({ cwd: projectDir });

    // 1. The exact /conformance/actions-inline shape.
    const page = require(pagePath);
    const inlineAction = (page.default || page)().action;
    const inlineActionId = actionRuntime.createInlineServerActionId(pagePath, 0, 'inlineEcho');

    assert.equal(
      typeof inlineAction,
      'function',
      'Expected the inline action to be returned from the page component'
    );
    assert.equal(
      actionRuntime.resolveRegisteredServerReference(inlineActionId),
      inlineAction,
      'An inline "use server" function declared inside the default-exported Server Component ' +
        'must be registered as a server reference by the module compile hook'
    );

    // 2. Ordinals are assigned in source order, across declaration and arrow shapes.
    const ordered = require(orderedPath).buildOrderedActions();
    assert.equal(
      actionRuntime.resolveRegisteredServerReference(
        actionRuntime.createInlineServerActionId(orderedPath, 0, 'firstAction')
      ),
      ordered.firstAction,
      'The first inline action in a module must register with ordinal 0'
    );
    assert.equal(
      actionRuntime.resolveRegisteredServerReference(
        actionRuntime.createInlineServerActionId(orderedPath, 1, 'secondAction')
      ),
      ordered.secondAction,
      'The second inline action in a module must register with ordinal 1'
    );

    // 3. The build manifest and the runtime must agree on every action id --
    //    the conformance suite looks actions up by their manifest id.
    const manifest = generateServerManifest(projectDir, appDir);
    const manifestActionIds = Object.values(manifest.serverActions)
      .filter((entry) => entry.kind === 'inline')
      .map((entry) => entry.id);

    assert.ok(
      manifestActionIds.includes(inlineActionId),
      `Build manifest is missing the inline action id ${inlineActionId}. Found: ` +
        JSON.stringify(manifestActionIds, null, 2)
    );

    for (const actionId of manifestActionIds) {
      assert.ok(
        actionRuntime.resolveRegisteredServerReference(actionId),
        `Action id ${actionId} is present in the build manifest but was never registered at ` +
          'runtime, so an action request for it would fail with HTTP 500'
      );
    }

    console.log('Inline server action verification passed.');
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error('Inline server action verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
