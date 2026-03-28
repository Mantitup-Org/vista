/**
 * Vista Static Generator
 *
 * Pre-renders pages at build time for SSG and ISR routes.
 * Works with both the RSC pipeline (Flight payloads) and
 * legacy SSR (renderToString).
 *
 * Called after webpack compilation completes in `buildRSC()`.
 */

import path from 'path';
import fs from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import type { RouteEntry, ServerManifest } from '../build/rsc/server-manifest';
import { BUILD_DIR, STATIC_CHUNKS_PATH, HYDRATE_DOCUMENT_FLAG } from '../constants';
import {
  type CachedPage,
  type PrerenderManifest,
  writeStaticPageToDisk,
  setCachedPage,
  generatePrerenderManifest,
  isRevalidating,
  markRevalidating,
  clearRevalidating,
} from './static-cache';
import { installModuleCompileHook } from './module-compile-hook';
import { consumeTrackedTags, runWithRequestContext } from './request-context';
import {
  resolveConventionModule,
  resolveDirectoryChain,
  resolveParallelSlotMatches,
} from './app-router-runtime';
import { installSegmentFetchPolicyShim } from './fetch-policy';
import { getErrorMessage, isPermissionDeniedSpawnError } from './spawn-permissions';
import { loadConfig, resolveCacheComponentsConfig } from '../config';
import {
  createPartialPrerenderInfo,
  injectPprResumeBootstrap,
  isAppPPREnabled,
  isRoutePPREligible,
} from './ppr';
import { resolveVistaSourceRequest } from './vista-import-map';

const CjsModule = require('module');

let staticRuntimeReady = false;
let reactResolutionInstalled = false;
let originalResolveFilename: any = null;

function resolveFromWorkspace(specifier: string, cwd: string): string {
  const searchRoots = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '..', '..'),
    path.resolve(cwd, '..', '..', 'rsc'),
    path.resolve(cwd, '..', '..', '..'),
    path.resolve(cwd, '..', '..', '..', 'rsc'),
  ];

  for (const root of searchRoots) {
    try {
      return require.resolve(specifier, { paths: [root] });
    } catch {
      // continue
    }
  }

  return require.resolve(specifier);
}

function resolveVistaInternalRequest(request: string): string | null {
  return resolveVistaSourceRequest(request, path.resolve(__dirname, '..'));
}

function installSingleReactResolution(cwd: string): void {
  if (reactResolutionInstalled) return;

  let reactPath: string;
  let reactDomPath: string;
  try {
    reactPath = require.resolve('react', { paths: [cwd] });
    reactDomPath = require.resolve('react-dom', { paths: [cwd] });
  } catch {
    try {
      reactPath = require.resolve('react');
      reactDomPath = require.resolve('react-dom');
    } catch {
      return;
    }
  }

  originalResolveFilename = CjsModule._resolveFilename;
  CjsModule._resolveFilename = function (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown
  ) {
    const vistaResolvedPath = resolveVistaInternalRequest(request);
    if (vistaResolvedPath) return vistaResolvedPath;
    if (request === 'react') return reactPath;
    if (request === 'react-dom') return reactDomPath;

    if (request.startsWith('react/')) {
      const subPath = request.slice('react/'.length);
      try {
        return require.resolve(`react/${subPath}`, { paths: [path.dirname(reactPath)] });
      } catch {
        // fall through
      }
    }

    if (request.startsWith('react-dom/')) {
      const subPath = request.slice('react-dom/'.length);
      try {
        return require.resolve(`react-dom/${subPath}`, { paths: [path.dirname(reactDomPath)] });
      } catch {
        // fall through
      }
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  reactResolutionInstalled = true;
}

function setupTypeScriptRuntime(cwd: string): void {
  try {
    const swcRegisterPath = resolveFromWorkspace('@swc-node/register/register', cwd);
    const typescriptPath = resolveFromWorkspace('typescript', cwd);
    const { register } = require(swcRegisterPath) as { register: (options?: Record<string, any>) => void };
    const ts = require(typescriptPath) as typeof import('typescript');
    register({
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      esModuleInterop: true,
      allowJs: true,
    });
    return;
  } catch {
    // fallback
  }

  try {
    const tsNodePath = resolveFromWorkspace('ts-node', cwd);
    require(tsNodePath).register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        jsx: 'react-jsx',
        moduleResolution: 'node16',
        esModuleInterop: true,
        allowJs: true,
      },
    });
    return;
  } catch {
    // fallback
  }

  try {
    const tsxPath = resolveFromWorkspace('tsx/cjs', cwd);
    require(tsxPath);
  } catch {
    // no transpiler available
  }
}

function setupStaticGenerationRuntime(cwd: string): void {
  if (staticRuntimeReady) return;

  // Ignore CSS imports while requiring app modules for prerender.
  require.extensions['.css'] = (m: any, filename: string) => {
    if (filename.endsWith('.module.css')) {
      m.exports = {};
    }
  };

  const cacheComponentsConfig = resolveCacheComponentsConfig(loadConfig(cwd));
  installSingleReactResolution(cwd);
  setupTypeScriptRuntime(cwd);
  installModuleCompileHook({
    cwd,
    cacheComponentsEnabled: cacheComponentsConfig.enabled,
  });
  installSegmentFetchPolicyShim();
  staticRuntimeReady = true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaticGeneratorOptions {
  /** Project root */
  cwd: string;
  /** .vista directory root */
  vistaDirRoot: string;
  /** Server manifest with route info */
  manifest: ServerManifest;
  /** Whether in dev mode (limits prerendering) */
  isDev: boolean;
  /** Build ID for cache busting */
  buildId: string;
}

export interface StaticGeneratorResult {
  /** Number of pages pre-rendered */
  pagesGenerated: number;
  /** URL paths that were pre-rendered */
  generatedPaths: string[];
  /** Paths that failed */
  failedPaths: Array<{ path: string; error: string }>;
  /** The prerender manifest */
  manifest: PrerenderManifest;
}

interface StaticFlightUpstream {
  fetchFlight: (urlPath: string) => Promise<string | undefined>;
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Static param expansion
// ---------------------------------------------------------------------------

/**
 * For dynamic routes with `generateStaticParams`, call the function
 * and return the list of param sets.
 */
async function resolveStaticParams(
  route: RouteEntry,
  cwd: string
): Promise<Array<Record<string, string | string[]>>> {
  setupStaticGenerationRuntime(cwd);

  if (!route.hasGenerateStaticParams) {
    return [];
  }

  try {
    // Bust require cache to get fresh module
    try {
      delete require.cache[require.resolve(route.pagePath)];
    } catch {
      // ignore
    }

    const pageModule = require(route.pagePath);
    const generateStaticParams =
      pageModule.generateStaticParams || pageModule.default?.generateStaticParams;

    if (typeof generateStaticParams !== 'function') {
      return [];
    }

    const params = await generateStaticParams();
    if (!Array.isArray(params)) {
      console.warn(`[vista:ssg] generateStaticParams for ${route.pattern} did not return an array`);
      return [];
    }

    return params;
  } catch (err) {
    console.error(
      `[vista:ssg] Error calling generateStaticParams for ${route.pattern}:`,
      (err as Error).message
    );
    return [];
  }
}

/**
 * Expand a route pattern with params to get a concrete URL.
 * e.g., '/blog/:slug' + { slug: 'hello' } → '/blog/hello'
 */
function expandPattern(pattern: string, params: Record<string, string | string[]>): string {
  let url = pattern;

  for (const [key, value] of Object.entries(params)) {
    const param = Array.isArray(value) ? value.join('/') : value;
    // Handle catch-all :param* and optional catch-all :param*?
    url = url.replace(new RegExp(`:${key}\\*\\??`), param);
    // Handle regular :param
    url = url.replace(`:${key}`, param);
  }

  return url;
}

// ---------------------------------------------------------------------------
// Page pre-rendering
// ---------------------------------------------------------------------------

/**
 * Pre-render a single page.
 * Loads the page component and renders it to HTML.
 *
 * This is a simplified renderer that works with the compiled webpack
 * server bundle. For RSC mode, the actual Flight prerendering is
 * handled by the upstream process.
 */
async function prerenderPage(
  urlPath: string,
  route: RouteEntry,
  params: Record<string, string | string[]> | undefined,
  cwd: string,
  vistaDirRoot: string,
  appPprEnabled: boolean
): Promise<CachedPage | null> {
  setupStaticGenerationRuntime(cwd);

  return runWithRequestContext(
    {
      cwd,
      vistaDirRoot,
      urlPath,
      segmentConfig: route.segmentConfig,
    },
    async () => {
      try {
        const React = require('react');
        const { renderToString } = require('react-dom/server');

        const isAsyncComponent = (
          component: unknown
        ): component is (...args: any[]) => Promise<any> => {
          return (
            typeof component === 'function' &&
            (component as Function).constructor &&
            (component as Function).constructor.name === 'AsyncFunction'
          );
        };

        const renderComponent = async (
          component: any,
          props: Record<string, unknown>,
          child?: React.ReactNode
        ): Promise<React.ReactNode> => {
          if (isAsyncComponent(component)) {
            const asyncProps = child === undefined ? props : { ...props, children: child };
            return component(asyncProps);
          }

          if (child === undefined) {
            return React.createElement(component, props);
          }
          return React.createElement(component, props, child);
        };

        const renderStaticSubtree = async (input: {
          subtreeRootDir: string;
          entryFilePath: string;
          pathname: string;
          params: Record<string, string | string[]>;
          searchParams: Record<string, string>;
          disableParallelSlots?: boolean;
        }): Promise<React.ReactNode> => {
          const appDir = path.join(cwd, 'app');
          const RouteModule = require(input.entryFilePath);
          const RouteComponent = RouteModule.default;

          if (!RouteComponent) {
            throw new Error(`Route module does not export default component: ${input.entryFilePath}`);
          }

          let subtree = await renderComponent(RouteComponent, {
            params: input.params,
            searchParams: input.searchParams,
          });

          const directoryChain = resolveDirectoryChain(input.subtreeRootDir, input.entryFilePath);
          for (let i = directoryChain.length - 1; i >= 0; i--) {
            const dir = directoryChain[i];
            const layoutPath =
              resolveConventionModule(dir, 'root') ?? resolveConventionModule(dir, 'layout');

            if (!layoutPath || path.resolve(layoutPath) === path.resolve(input.entryFilePath)) {
              continue;
            }

            const LayoutModule = require(layoutPath);
            const LayoutComponent = LayoutModule.default;
            if (!LayoutComponent) {
              continue;
            }

            const slotProps: Record<string, React.ReactNode> = {};
            if (!input.disableParallelSlots) {
              const slotMatches = resolveParallelSlotMatches({
                appDir,
                layoutPath,
                pathname: input.pathname,
              });

              for (const slotMatch of slotMatches) {
                slotProps[slotMatch.slotName] = await renderStaticSubtree({
                  subtreeRootDir: slotMatch.slotRootDir,
                  entryFilePath: slotMatch.filePath,
                  pathname: input.pathname,
                  params: {
                    ...input.params,
                    ...slotMatch.params,
                  },
                  searchParams: input.searchParams,
                });
              }
            }

            subtree = await renderComponent(
              LayoutComponent,
              {
                params: input.params,
                searchParams: input.searchParams,
                ...slotProps,
              },
              subtree
            );
          }

          return subtree;
        };

        // Load page component from webpack-built server bundle
        const pageModule = require(route.pagePath);
        const PageComponent = pageModule.default;

        if (!PageComponent) {
          console.warn(`[vista:ssg] No default export in ${route.pagePath}`);
          return null;
        }

        let metadata: Record<string, unknown> = {};
        const searchParams = {};

        for (const layoutPath of route.layoutPaths) {
          try {
            const layoutModule = require(layoutPath);
            if (layoutModule?.metadata && typeof layoutModule.metadata === 'object') {
              metadata = { ...metadata, ...layoutModule.metadata };
            }
          } catch {
            // Ignore layout metadata failures for static generation.
          }
        }

        if (pageModule.metadata && typeof pageModule.metadata === 'object') {
          metadata = { ...metadata, ...pageModule.metadata };
        }

        if (typeof pageModule.generateMetadata === 'function') {
          try {
            const dynamicMeta = await pageModule.generateMetadata(
              { params: params || {}, searchParams },
              metadata
            );
            if (dynamicMeta && typeof dynamicMeta === 'object') {
              metadata = { ...metadata, ...dynamicMeta };
            }
          } catch (metadataError) {
            console.warn(
              `[vista:ssg] generateMetadata failed for ${urlPath}:`,
              (metadataError as Error)?.message || String(metadataError)
            );
          }
        }

        let metadataHtml = '';
        try {
          const { generateMetadataHtml } = require('../metadata/generate');
          metadataHtml = generateMetadataHtml(metadata as any);
        } catch {
          metadataHtml = '';
        }

        const element = await renderStaticSubtree({
          subtreeRootDir: path.join(cwd, 'app'),
          entryFilePath: route.pagePath,
          pathname: urlPath,
          params: params || {},
          searchParams,
        });

        const pprEnabled = isRoutePPREligible(route, appPprEnabled);
        let shellHtml: string | undefined;
        let pprInfo = undefined;

        if (pprEnabled && route.loadingPath) {
          try {
            const shellElement = await renderStaticSubtree({
              subtreeRootDir: path.join(cwd, 'app'),
              entryFilePath: route.loadingPath,
              pathname: urlPath,
              params: params || {},
              searchParams,
            });
            const renderedShellHtml = renderToString(shellElement);
            shellHtml = injectPprResumeBootstrap(
              wrapInDocument(`${renderedShellHtml}\n<!--vista:ppr-shell-->`, urlPath, metadataHtml, cwd),
              urlPath
            );
            pprInfo = createPartialPrerenderInfo(urlPath);
          } catch (shellError) {
            console.warn(
              `[vista:ppr] Failed to generate shell for ${urlPath}:`,
              (shellError as Error)?.message || String(shellError)
            );
          }
        }

        // Render to HTML string
        const html = renderToString(element);

        return {
          html: wrapInDocument(html, urlPath, metadataHtml, cwd),
          shellHtml,
          generatedAt: Date.now(),
          revalidate: route.revalidate || 0,
          routePattern: route.pattern,
          params,
          tags: consumeTrackedTags(),
          ppr: pprInfo,
        };
      } catch (err) {
        console.error(
          `[vista:ssg] Error pre-rendering ${urlPath}:`,
          (err as Error)?.message || String(err)
        );
        return null;
      }
    }
  );
}

/**
 * Wrap rendered HTML in a basic document shell.
 */
function injectBeforeClosingTag(html: string, tagName: string, injection: string): string {
  const closeTag = `</${tagName}>`;
  if (html.includes(closeTag)) {
    return html.replace(closeTag, `${injection}\n${closeTag}`);
  }
  return html;
}

function getCSSLinks(cwd: string): string {
  const links = ['<link rel="stylesheet" href="/styles.css" />'];
  const chunksDir = path.join(cwd, BUILD_DIR, 'static', 'chunks');

  try {
    if (fs.existsSync(chunksDir)) {
      const files = fs.readdirSync(chunksDir).filter((entry) => entry.endsWith('.css'));
      for (const file of files) {
        links.push(`<link rel="stylesheet" href="${STATIC_CHUNKS_PATH}${file}" />`);
      }
    }
  } catch {
    // Ignore CSS discovery failures during static generation.
  }

  return links.join('\n  ');
}

function getChunkScripts(cwd: string): string {
  const chunksDir = path.join(cwd, BUILD_DIR, 'static', 'chunks');

  try {
    if (!fs.existsSync(chunksDir)) {
      return '';
    }

    const files = fs
      .readdirSync(chunksDir)
      .filter(
        (entry) =>
          entry.endsWith('.js') && !entry.endsWith('.map') && !entry.includes('.hot-update.')
      );

    const priority = ['webpack.js', 'framework.js', 'vendor.js'];
    files.sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    return files
      .map((file) => `<script defer src="${STATIC_CHUNKS_PATH}${file}"></script>`)
      .join('\n  ');
  } catch {
    // Ignore chunk discovery failures during static generation.
    return '';
  }
}

function resolveUpstreamScriptPath(): string | null {
  const jsPath = path.join(__dirname, 'rsc-upstream.js');
  if (fs.existsSync(jsPath)) {
    return jsPath;
  }

  const tsPath = path.join(__dirname, 'rsc-upstream.ts');
  if (fs.existsSync(tsPath)) {
    return tsPath;
  }

  return null;
}

function waitForUpstreamReady(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let logs = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `[vista:ssg] Timed out waiting for RSC upstream readiness (${timeoutMs}ms)\n${logs}`
        )
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.removeListener('data', onData);
      child.stderr.removeListener('data', onData);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    };

    const onData = (chunk: Buffer | string) => {
      logs += chunk.toString();
      if (logs.includes('Listening on')) {
        cleanup();
        resolve();
      }
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new Error(
          `[vista:ssg] RSC upstream exited before readiness (code: ${code ?? 'unknown'})`
        )
      );
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function startStaticFlightUpstream(cwd: string): Promise<StaticFlightUpstream | null> {
  const upstreamScript = resolveUpstreamScriptPath();
  if (!upstreamScript) {
    return null;
  }

  const port = Number(process.env.VISTA_STATIC_RSC_PORT || 3181);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(
      process.execPath,
      ['--conditions', 'react-server', upstreamScript, '--port', String(port)],
      {
        cwd,
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
          RSC_UPSTREAM_PORT: String(port),
        },
        stdio: 'pipe',
      }
    );
  } catch (spawnError) {
    if (isPermissionDeniedSpawnError(spawnError)) {
      return null;
    }
    throw spawnError;
  }

  try {
    await waitForUpstreamReady(child, 12000);
  } catch (startupError) {
    if (isPermissionDeniedSpawnError(startupError)) {
      try {
        if (!child.killed) {
          child.kill();
        }
      } catch {
        // ignore cleanup failures
      }
      return null;
    }

    throw startupError;
  }

  const close = async () => {
    if (child.killed) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore force-kill failures
        }
      }, 2500);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        child.kill();
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  };

  return {
    async fetchFlight(urlPath: string): Promise<string | undefined> {
      const normalizedPath = urlPath === '/' ? '' : urlPath;
      const flightUrl = `http://127.0.0.1:${port}/rsc${normalizedPath}`;

      try {
        const response = await fetch(flightUrl, {
          headers: { Accept: 'text/x-component' },
        });

        if (!response.ok) {
          return undefined;
        }

        return await response.text();
      } catch {
        return undefined;
      }
    },
    close,
  };
}

function wrapInDocument(bodyHtml: string, _urlPath: string, metadataHtml: string, cwd: string): string {
  const headInjection = `\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  ${metadataHtml}\n  ${getCSSLinks(cwd)}`;
  const scripts = getChunkScripts(cwd);
  const hasDocumentMarkup =
    /<html(?:\s|>)/i.test(bodyHtml) && /<\/html>/i.test(bodyHtml);

  if (hasDocumentMarkup) {
    const htmlStart = bodyHtml.search(/<html(?:\s|>)/i);
    let html = htmlStart > 0 ? bodyHtml.slice(htmlStart) : bodyHtml;
    if (!/^\s*<!doctype html>/i.test(html)) {
      html = `<!DOCTYPE html>\n${html}`;
    }
    html = injectBeforeClosingTag(html, 'head', headInjection);
    const bodyInjection = `\n  <script>window.${HYDRATE_DOCUMENT_FLAG} = true;</script>\n  ${scripts}`;
    html = injectBeforeClosingTag(html, 'body', bodyInjection);
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${headInjection}
</head>
<body>
  <script>window.${HYDRATE_DOCUMENT_FLAG} = false;</script>
  <div id="root">${bodyHtml}</div>
  ${scripts}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run static generation for all eligible routes.
 */
export async function generateStaticPages(
  options: StaticGeneratorOptions
): Promise<StaticGeneratorResult> {
  const { cwd, vistaDirRoot, manifest, isDev, buildId } = options;
  const vistaConfig = loadConfig(cwd);
  const appPprEnabled = isAppPPREnabled(vistaConfig);
  const result: StaticGeneratorResult = {
    pagesGenerated: 0,
    generatedPaths: [],
    failedPaths: [],
    manifest: { routes: {}, dynamicRoutes: {}, notFoundRoutes: [] },
  };

  // In dev mode, skip prerendering (pages are rendered on demand)
  if (isDev) {
    result.manifest = generatePrerenderManifest(manifest.routes, undefined, { appPprEnabled });
    return result;
  }

  const staticRoutes = manifest.routes.filter(
    (r) => r.renderMode === 'static' || r.renderMode === 'isr'
  );

  console.log(`[vista:ssg] Found ${staticRoutes.length} routes eligible for static generation`);
  let flightUpstream: StaticFlightUpstream | null = null;
  try {
    flightUpstream = await startStaticFlightUpstream(cwd);
  } catch (flightError) {
    if (isPermissionDeniedSpawnError(flightError)) {
      console.log(
        '[vista:ssg] Flight payload pre-generation skipped (spawn blocked by environment permissions)'
      );
    } else {
      console.warn(`[vista:ssg] Flight payload pre-generation disabled: ${getErrorMessage(flightError)}`);
    }
  }

  try {
    for (const route of staticRoutes) {
      if (route.type === 'static') {
        // Simple static route — single URL
        const urlPath = route.pattern;
          const page = await prerenderPage(
            urlPath,
            route,
            undefined,
            cwd,
            vistaDirRoot,
            appPprEnabled
          );

        if (page) {
          if (flightUpstream) {
            const flightData = await flightUpstream.fetchFlight(urlPath);
            if (flightData) {
              page.flightData = flightData;
            }
          }

          setCachedPage(urlPath, page);
          writeStaticPageToDisk(vistaDirRoot, urlPath, page);
          result.generatedPaths.push(urlPath);
          result.pagesGenerated++;
        } else {
          result.failedPaths.push({ path: urlPath, error: 'Prerender returned null' });
        }
      } else if (route.hasGenerateStaticParams) {
        // Dynamic route with generateStaticParams — expand to concrete URLs
        const paramSets = await resolveStaticParams(route, cwd);

        if (paramSets.length === 0) {
          console.log(`[vista:ssg] No static params for ${route.pattern} — will render on demand`);
          continue;
        }

        for (const params of paramSets) {
          const urlPath = expandPattern(route.pattern, params);
          const page = await prerenderPage(
            urlPath,
            route,
            params,
            cwd,
            vistaDirRoot,
            appPprEnabled
          );

          if (page) {
            if (flightUpstream) {
              const flightData = await flightUpstream.fetchFlight(urlPath);
              if (flightData) {
                page.flightData = flightData;
              }
            }

            setCachedPage(urlPath, page);
            writeStaticPageToDisk(vistaDirRoot, urlPath, page);
            result.generatedPaths.push(urlPath);
            result.pagesGenerated++;
          } else {
            result.failedPaths.push({ path: urlPath, error: 'Prerender returned null' });
          }
        }
      }
    }
  } finally {
    if (flightUpstream) {
      await flightUpstream.close();
    }
  }

  // Generate prerender manifest
  result.manifest = generatePrerenderManifest(manifest.routes, undefined, { appPprEnabled });

  // Write manifest to disk
  const manifestPath = path.join(vistaDirRoot, 'prerender-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2));

  console.log(
    `[vista:ssg] Generated ${result.pagesGenerated} static pages` +
      (result.failedPaths.length > 0 ? ` (${result.failedPaths.length} failed)` : '')
  );

  return result;
}

/**
 * Trigger ISR revalidation for a specific path.
 * Called at runtime when a stale page is requested.
 */
export async function revalidatePath(
  urlPath: string,
  route: RouteEntry,
  params: Record<string, string | string[]> | undefined,
  cwd: string,
  vistaDirRoot: string
): Promise<boolean> {
  if (isRevalidating(urlPath)) {
    return false; // Already being revalidated
  }

  markRevalidating(urlPath);

  try {
    const page = await prerenderPage(
      urlPath,
      route,
      params,
      cwd,
      vistaDirRoot,
      isAppPPREnabled(loadConfig(cwd))
    );

    if (page) {
      setCachedPage(urlPath, page);
      writeStaticPageToDisk(vistaDirRoot, urlPath, page);
      return true;
    }

    return false;
  } catch (err) {
    console.error(
      `[vista:isr] Revalidation failed for ${urlPath}:`,
      (err as Error)?.message || String(err)
    );
    return false;
  } finally {
    clearRevalidating(urlPath);
  }
}
