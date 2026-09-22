import fs from 'fs';
import path from 'path';
import { resolveAppDir, resolveComponentsDir } from '../server/app-dir';

type GenerateCommand = 'api-init' | 'router' | 'procedure' | 'agent' | 'auth';
type ProcedureMethod = 'get' | 'post';

interface RunGenerateOptions {
  cwd?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

interface WriteResult {
  path: string;
  created: boolean;
}

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toPascalCase(value: string): string {
  return toKebabCase(value)
    .split('-')
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join('');
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : '';
}

function ensureDirectory(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
}

function writeFileIfMissing(baseDir: string, relativePath: string, content: string): WriteResult {
  const absolutePath = path.join(baseDir, relativePath);
  if (fs.existsSync(absolutePath)) {
    return { path: absolutePath, created: false };
  }

  ensureDirectory(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, content, 'utf8');
  return { path: absolutePath, created: true };
}

function renderAgent(kebabName: string): string {
  const camelName = toCamelCase(kebabName);
  return [
    "import { agent, tool } from 'vista/ai';",
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

function renderAgentRoute(kebabName: string): string {
  const camelName = toCamelCase(kebabName);
  return [
    `import { ${camelName}Agent } from '../../../agents/${kebabName}/agent';`,
    '',
    'export async function POST(req: Request) {',
    '  const { prompt, messages, sessionId } = await req.json();',
    `  const stream = ${camelName}Agent.stream({ prompt, messages, sessionId });`,
    '  return stream.toDataStreamResponse();',
    '}',
    '',
  ].join('\n');
}

function renderAppAgentsGuide(): string {
  return [
    '# App agents',
    '',
    'Runtime Vista agents live in `app/agents/<name>/agent.ts` and stream from `app/api/agents/<name>/route.ts`.',
    '',
    'Generate one with:',
    '',
    '```bash',
    'vista g agent support',
    '```',
    '',
    'Model strings use `provider:model`. Free-tier friendly options:',
    '',
    '- `groq:llama-3.1-8b-instant` (`GROQ_API_KEY`)',
    '- `nvidia:meta/llama-3.1-8b-instruct` (`NVIDIA_API_KEY`)',
    '- `openai:gpt-4o` (`OPENAI_API_KEY`)',
    '',
    "Embeddings: `import { embedText } from 'vista/ai'` then pass `embed: embedText` to `createRetrieverTool`.",
    '',
  ].join('\n');
}

function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function insertTypedApiConfigIntoObject(source: string, objectStartIndex: number): string | null {
  const openBraceIndex = source.indexOf('{', objectStartIndex);
  if (openBraceIndex < 0) {
    return null;
  }
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
  if (closeBraceIndex < 0) {
    return null;
  }

  const objectContent = source.slice(openBraceIndex, closeBraceIndex);
  const expMatch = objectContent.match(/\bexperimental\s*:\s*\{/);
  if (expMatch && typeof expMatch.index === 'number') {
    const absExpBrace = openBraceIndex + expMatch.index + expMatch[0].lastIndexOf('{');
    const expCloseBrace = findMatchingBrace(source, absExpBrace);
    if (expCloseBrace >= 0) {
      const expBefore = source.slice(0, expCloseBrace);
      const expAfter = source.slice(expCloseBrace);
      const insertion = `  typedApi: {\n      enabled: true,\n    },\n  `;
      return `${expBefore}${insertion}${expAfter}`;
    }
  }

  const before = source.slice(0, closeBraceIndex);
  const after = source.slice(closeBraceIndex);
  const insertion = `\n  experimental: {\n    typedApi: {\n      enabled: true,\n    },\n  },`;
  return `${before}${insertion}${after}`;
}

function ensureTypedApiEnabledInConfig(
  cwd: string
): 'created' | 'updated' | 'unchanged' | 'manual' {
  const tsPath = path.join(cwd, 'vista.config.ts');
  const jsPath = path.join(cwd, 'vista.config.js');

  if (!fs.existsSync(tsPath) && !fs.existsSync(jsPath)) {
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
    fs.writeFileSync(tsPath, configSource, 'utf8');
    return 'created';
  }

  const targetPath = fs.existsSync(tsPath) ? tsPath : jsPath;
  const source = fs.readFileSync(targetPath, 'utf8');

  if (/\btypedApi\b/.test(source) && /\benabled\s*:\s*true\b/.test(source)) {
    return 'unchanged';
  }

  const constConfigIndex = source.indexOf('const config');
  if (constConfigIndex >= 0) {
    const updated = insertTypedApiConfigIntoObject(source, constConfigIndex);
    if (updated) {
      fs.writeFileSync(targetPath, updated, 'utf8');
      return 'updated';
    }
  }

  const exportDefaultIndex = source.indexOf('export default');
  if (exportDefaultIndex >= 0) {
    const updated = insertTypedApiConfigIntoObject(source, exportDefaultIndex);
    if (updated) {
      fs.writeFileSync(targetPath, updated, 'utf8');
      return 'updated';
    }
  }

  return 'manual';
}

function renderApiInitEntrypoint(): string {
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

function renderRootRouter(): string {
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

function renderProcedure(name: string, method: ProcedureMethod): string {
  const safeName = toCamelCase(name);
  const functionName = `${safeName}Procedure`;
  const procedureMethod = method === 'post' ? 'mutation' : 'query';
  const sampleResult =
    method === 'post'
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

function renderRouter(name: string): string {
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

function renderAuthConfig(): string {
  return [
    "import VistaAuth, { Credentials, GitHub, Google } from 'vista/auth';",
    '',
    'export const { handlers, auth, signIn, signOut, authMiddleware } = VistaAuth({',
    "  pages: { signIn: '/signin' },",
    '  providers: [',
    '    GitHub({}),',
    '    Google({}),',
    '    Credentials({',
    '      authorize: async (credentials) => {',
    "        if (!credentials.email || !credentials.password) return null;",
    '        return { id: credentials.email, email: credentials.email, name: credentials.email };',
    '      },',
    '    }),',
    '  ],',
    '  callbacks: {',
    '    jwt: async ({ token }) => token,',
    '    session: async ({ session }) => session,',
    '    redirect: async ({ url }) => url,',
    '  },',
    '});',
    '',
  ].join('\n');
}

function renderAuthRoute(): string {
  return [
    "import { handlers } from '../../../../auth';",
    '',
    'export const { GET, POST } = handlers;',
    '',
  ].join('\n');
}

function renderAuthMiddleware(): string {
  return [
    "import { authMiddleware } from './auth';",
    '',
    "export default authMiddleware(({ auth, request }) => {",
    '  const pathname = new URL(request.url).pathname;',
    "  if (pathname.startsWith('/account') && !auth) {",
    '    return false;',
    '  }',
    '  return true;',
    '});',
    '',
  ].join('\n');
}

function renderAuthSessionProvider(): string {
  return [
    "'use client';",
    '',
    "import type { ReactNode } from 'react';",
    "import { SessionProvider } from 'vista/auth/react';",
    '',
    'export function AuthSessionProvider({ children }: { children: ReactNode }) {',
    '  return <SessionProvider>{children}</SessionProvider>;',
    '}',
    '',
  ].join('\n');
}

function renderSignInPage(): string {
  return [
    "'use client';",
    '',
    "import { useState } from 'react';",
    "import { signIn } from 'vista/auth/react';",
    '',
    'export default function SignInPage() {',
    "  const [email, setEmail] = useState('');",
    "  const [password, setPassword] = useState('');",
    '',
    '  return (',
    '    <main style={{ maxWidth: 360, margin: "4rem auto", display: "grid", gap: 12 }}>',
    '      <h1>Sign in</h1>',
    '      <form',
    '        onSubmit={(event) => {',
    '          event.preventDefault();',
    "          void signIn('credentials', { email, password, callbackUrl: '/account' });",
    '        }}',
    '        style={{ display: "grid", gap: 8 }}',
    '      >',
    '        <input',
    '          type="email"',
    '          name="email"',
    '          placeholder="Email"',
    '          value={email}',
    '          onChange={(event) => setEmail(event.target.value)}',
    '          required',
    '        />',
    '        <input',
    '          type="password"',
    '          name="password"',
    '          placeholder="Password"',
    '          value={password}',
    '          onChange={(event) => setPassword(event.target.value)}',
    '          required',
    '        />',
    '        <button type="submit">Continue with email</button>',
    '      </form>',
    '      <button type="button" onClick={() => void signIn("github", { callbackUrl: "/account" })}>',
    '        Continue with GitHub',
    '      </button>',
    '      <button type="button" onClick={() => void signIn("google", { callbackUrl: "/account" })}>',
    '        Continue with Google',
    '      </button>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function renderAccountPage(): string {
  return [
    "export const dynamic = 'force-dynamic';",
    '',
    "import { auth } from '../../auth';",
    '',
    'export default async function AccountPage() {',
    '  const session = await auth();',
    '  if (!session?.user) {',
    '    return <p>Not signed in.</p>;',
    '  }',
    '  return (',
    '    <main style={{ maxWidth: 480, margin: "4rem auto" }}>',
    '      <h1>Account</h1>',
    '      <p>Signed in as {session.user.email || session.user.name || session.user.id}</p>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function renderEnvExample(): string {
  return [
    'AUTH_SECRET=',
    'AUTH_GITHUB_ID=',
    'AUTH_GITHUB_SECRET=',
    'AUTH_GOOGLE_ID=',
    'AUTH_GOOGLE_SECRET=',
    '',
  ].join('\n');
}

/**
 * Ensure the AuthSessionProvider import is present. Handles both "vista/theme" and
 * components layout conventions. Falls back to appending an import line when no
 * anchor import is found.
 */
function ensureAuthSessionProviderImport(source: string): string {
  if (source.includes("from '../components/auth-session-provider'")) {
    return source;
  }

  const importLine = "import { AuthSessionProvider } from '../components/auth-session-provider';";

  // Anchor on the existing vista/theme import when present (preserves grouping).
  const themeImportMatch = source.match(/from 'vista\/theme';/);
  if (themeImportMatch && typeof themeImportMatch.index === 'number') {
    const insertAt = themeImportMatch.index + themeImportMatch[0].length;
    return `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
  }

  // Otherwise insert after the last top-level import statement.
  const importRegex = /^\s*import\s[^;]*;\s*$/gm;
  let lastImportEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    lastImportEnd = match.index + match[0].length;
  }
  if (lastImportEnd >= 0) {
    return `${source.slice(0, lastImportEnd)}\n${importLine}${source.slice(lastImportEnd)}`;
  }

  // No imports at all — prepend.
  return `${importLine}\n${source}`;
}

/**
 * Insert the AuthSessionProvider as the innermost wrapper around {children}
 * inside a <ThemeProvider> opening/closing pair, tolerating multiline bodies.
 *
 * Strategy: locate `<ThemeProvider ...>` and its matching `</ThemeProvider>`,
 * then replace the body with `<AuthSessionProvider>{children}</AuthSessionProvider>`.
 * If the body already is `{children}` (single or multiline, with surrounding
 * whitespace), we simply wrap. If the body is more complex, we still wrap the
 * whole existing body so session is wired regardless.
 */
function wrapChildrenInsideThemeProvider(source: string): string | null {
  const openMatch = source.match(/<ThemeProvider(\s[^>]*)?>/);
  if (!openMatch || typeof openMatch.index !== 'number') {
    return null;
  }

  const openTagEnd = openMatch.index + openMatch[0].length;
  const closeIndex = source.indexOf('</ThemeProvider>', openTagEnd);
  if (closeIndex < 0) {
    return null;
  }

  const inner = source.slice(openTagEnd, closeIndex);

  // If already wrapped, bail (caller checks AuthSessionProvider presence first).
  if (inner.includes('<AuthSessionProvider')) {
    return null;
  }

  const before = source.slice(0, openTagEnd);
  const after = source.slice(closeIndex);

  // Preserve the existing inner content (which may be `{children}` or a multiline
  // expression) and wrap it with the AuthSessionProvider.
  const replacement = `${before}<AuthSessionProvider>${inner}</AuthSessionProvider>${after}`;
  return replacement;
}

/**
 * Insert <AuthSessionProvider>{children}</AuthSessionProvider> directly inside the
 * <body> tag when no ThemeProvider is present. Falls back to wrapping {children}
 * usage in the body if a literal <body> tag is not found.
 */
function insertAuthSessionProviderInBody(source: string): string | null {
  const bodyOpenMatch = source.match(/<body(\s[^>]*)?>/);
  if (bodyOpenMatch && typeof bodyOpenMatch.index === 'number') {
    const bodyTagEnd = bodyOpenMatch.index + bodyOpenMatch[0].length;
    const before = source.slice(0, bodyTagEnd);
    const after = source.slice(bodyTagEnd);
    return `${before}<AuthSessionProvider>{children}</AuthSessionProvider>${after}`;
  }

  // Fallback: wrap the {children} expression inside the default export's return.
  const childrenMatch = source.match(/(\{children\})/);
  if (childrenMatch && typeof childrenMatch.index === 'number') {
    const idx = childrenMatch.index;
    return `${source.slice(0, idx)}<AuthSessionProvider>${childrenMatch[0]}</AuthSessionProvider>${source.slice(idx + childrenMatch[0].length)}`;
  }

  return null;
}

function patchRootWithSessionProvider(cwd: string): { path: string; patched: boolean } {
  const absolutePath = path.join(resolveAppDir(cwd), 'root.tsx');
  if (!fs.existsSync(absolutePath)) {
    return { path: absolutePath, patched: false };
  }

  let source = fs.readFileSync(absolutePath, 'utf8');
  if (source.includes('AuthSessionProvider')) {
    return { path: absolutePath, patched: false };
  }

  let next: string | null = null;

  if (source.includes('<ThemeProvider')) {
    next = wrapChildrenInsideThemeProvider(source);
  } else {
    next = insertAuthSessionProviderInBody(source);
  }

  if (next === null || next === source) {
    return { path: absolutePath, patched: false };
  }

  next = ensureAuthSessionProviderImport(next);

  fs.writeFileSync(absolutePath, next, 'utf8');
  return { path: absolutePath, patched: true };
}

function printGenerateUsage(log: (message: string) => void): void {
  log('Vista generator usage:');
  log('  vista g api-init');
  log('  vista g router <name>');
  log('  vista g procedure <name> [get|post]');
  log('  vista g agent <name>');
  log('  vista g auth');
}

export async function runGenerateCommand(
  args: string[],
  options: RunGenerateOptions = {}
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;

  const command = (args[0] || '').toLowerCase() as GenerateCommand;
  if (!command || !['api-init', 'router', 'procedure', 'agent', 'auth'].includes(command)) {
    printGenerateUsage(log);
    return 1;
  }

  // Write generated files into the resolved app/components dirs (supports src/app layout).
  const appDirRelative = path.relative(cwd, resolveAppDir(cwd));
  const componentsDirRelative = path.relative(cwd, resolveComponentsDir(cwd));

  if (command === 'api-init') {
    const writes = [
      writeFileIfMissing(cwd, path.join(appDirRelative, 'api', 'typed.ts'), renderApiInitEntrypoint()),
      writeFileIfMissing(cwd, path.join(appDirRelative, 'api', 'routers', 'index.ts'), renderRootRouter()),
      writeFileIfMissing(
        cwd,
        path.join(appDirRelative, 'api', 'procedures', 'health.ts'),
        renderProcedure('health', 'get')
      ),
    ];

    const configState = ensureTypedApiEnabledInConfig(cwd);

    writes.forEach((result) => {
      const relativePath = path.relative(cwd, result.path).replace(/\\/g, '/');
      log(`${result.created ? 'created' : 'skipped'} ${relativePath}`);
    });

    if (configState === 'created') {
      log('created vista.config.ts with experimental.typedApi.enabled = true');
    } else if (configState === 'updated') {
      log('updated vista.config.* to enable experimental typed API');
    } else if (configState === 'unchanged') {
      log('typed API config already enabled');
    } else {
      error(
        'Could not update vista.config automatically. Please enable experimental.typedApi.enabled manually.'
      );
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

    const result = writeFileIfMissing(
      cwd,
      path.join(appDirRelative, 'api', 'routers', `${safeName}.ts`),
      renderRouter(safeName)
    );
    const relativePath = path.relative(cwd, result.path).replace(/\\/g, '/');
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

    const result = writeFileIfMissing(
      cwd,
      path.join(appDirRelative, 'api', 'procedures', `${safeName}.ts`),
      renderProcedure(safeName, methodArg)
    );
    const relativePath = path.relative(cwd, result.path).replace(/\\/g, '/');
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

    const agentFile = writeFileIfMissing(
      cwd,
      path.join(appDirRelative, 'agents', safeName, 'agent.ts'),
      renderAgent(safeName)
    );
    const routeFile = writeFileIfMissing(
      cwd,
      path.join(appDirRelative, 'api', 'agents', safeName, 'route.ts'),
      renderAgentRoute(safeName)
    );
    const guideFile = writeFileIfMissing(cwd, path.join(appDirRelative, 'AGENTS.md'), renderAppAgentsGuide());

    [agentFile, routeFile, guideFile].forEach((res) => {
      const relativePath = path.relative(cwd, res.path).replace(/\\/g, '/');
      log(`${res.created ? 'created' : 'skipped'} ${relativePath}`);
    });
    return 0;
  }

  if (command === 'auth') {
    const writes = [
      writeFileIfMissing(cwd, 'auth.ts', renderAuthConfig()),
      writeFileIfMissing(
        cwd,
        path.join(appDirRelative, 'api', 'auth', '[...vista]', 'route.ts'),
        renderAuthRoute()
      ),
      writeFileIfMissing(cwd, 'middleware.ts', renderAuthMiddleware()),
      writeFileIfMissing(
        cwd,
        path.join(componentsDirRelative, 'auth-session-provider.tsx'),
        renderAuthSessionProvider()
      ),
      writeFileIfMissing(cwd, path.join(appDirRelative, 'signin', 'page.tsx'), renderSignInPage()),
      writeFileIfMissing(cwd, path.join(appDirRelative, 'account', 'page.tsx'), renderAccountPage()),
      writeFileIfMissing(cwd, '.env.example', renderEnvExample()),
    ];
    writes.forEach((result) => {
      const relativePath = path.relative(cwd, result.path).replace(/\\/g, '/');
      log(`${result.created ? 'created' : 'skipped'} ${relativePath}`);
    });
    const rootPatch = patchRootWithSessionProvider(cwd);
    const rootRelative = path.relative(cwd, rootPatch.path).replace(/\\/g, '/');
    log(rootPatch.patched ? `updated ${rootRelative}` : `skipped ${rootRelative}`);
    log('Set AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET in your environment.');
    log('Credentials sign-in POSTs from /signin. OAuth honors callbackUrl. /account is auth-gated.');
    return 0;
  }

  printGenerateUsage(log);
  return 1;
}
