import path from 'path';
import fs from 'fs';
import webpack from 'webpack';
import { createWebpackConfig } from './webpack.config';
import { scanAppDirectory, isNativeAvailable, getVersion } from './file-scanner';
import {
  createVistaDirectories,
  getBuildId,
  pruneEmptyVistaDirectories,
  writeCanonicalVistaArtifacts,
  writeReservedVistaArtifacts,
} from '../build/manifest';
import {
  loadConfig,
  resolveCacheComponentsConfig,
  resolveAndApplyEngineVariant,
  resolveStructureValidationConfig,
} from '../config';
import { CLIENT_COMPONENTS_FLAG, SSE_ENDPOINT } from '../constants';
import {
  validateAppStructure,
  type StructureValidationResult,
} from '../server/structure-validator';
import { logValidationResult, formatBuildFailTable } from '../server/structure-log';
import { getDevToolsIndicatorBootstrapSource } from './devtools-indicator-snippet';
import { getDevErrorOverlayBootstrapSource } from './dev-error-overlay-snippet';
import { generateDeploymentOutputs } from './deploy-output';
import { validateModuleBoundaries } from '../server/module-boundary-validator';

const _debug = !!process.env.VISTA_DEBUG;

interface RouteArtifactEntry {
  pattern: string;
  pagePath: string;
  type: 'static' | 'dynamic' | 'catch-all';
}

// Helper to run PostCSS
function runPostCSS(cwd: string, vistaDir: string) {
  const globalsCss = path.join(cwd, 'app/globals.css');
  if (fs.existsSync(globalsCss)) {
    if (_debug) console.log('Building CSS with PostCSS...');
    const { execSync } = require('child_process');
    try {
      const cssOut = path.join(vistaDir, 'client.css');
      execSync(`npx postcss app/globals.css -o "${cssOut}"`, {
        stdio: _debug ? 'inherit' : 'pipe',
        cwd,
      });
      if (_debug) console.log('CSS Built Successfully!');
    } catch (cssErr) {
      console.error('CSS Build failed (PostCSS error).');
    }
  }
}

function collectRouteArtifactEntries(
  node: any,
  segments: string[] = [],
  entries: RouteArtifactEntry[] = []
): RouteArtifactEntry[] {
  const nextSegments = [...segments];
  if (node.segment) {
    if (node.kind === 'dynamic') {
      nextSegments.push(`:${node.segment}`);
    } else if (node.kind === 'catch-all') {
      nextSegments.push(`:${node.segment}*`);
    } else if (node.kind !== 'group') {
      nextSegments.push(node.segment);
    }
  }

  if (node.indexPath) {
    const pattern = nextSegments.length === 0 ? '/' : `/${nextSegments.join('/')}`;
    const type: RouteArtifactEntry['type'] = pattern.includes('*')
      ? 'catch-all'
      : pattern.includes(':')
        ? 'dynamic'
        : 'static';
    entries.push({
      pattern,
      pagePath: String(node.indexPath),
      type,
    });
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) =>
      collectRouteArtifactEntries(child, nextSegments, entries)
    );
  }

  return entries;
}

// Generate Client Entry File - TRUE RSC
// Only imports components with 'use client' directive
function generateClientEntry(
  cwd: string,
  vistaDir: string,
  clientComponents: Array<{ relativePath: string; absolutePath: string }>,
  isDev: boolean = false
) {
  const devToolsBootId = `legacy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const appDir = path.join(cwd, 'app');

  // Generate imports ONLY for client components
  const clientImports: string[] = [];
  const clientRegistrations: string[] = [];

  clientComponents.forEach((comp, index) => {
    const relativePath = './' + path.relative(vistaDir, comp.absolutePath).replace(/\\/g, '/');
    const componentName = `ClientComponent_${index}`;
    const componentId = comp.relativePath.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');

    // Extract just the component name (e.g., "Navbar" from "components/Navbar")
    const baseName = path.basename(comp.relativePath).replace(/\.(tsx|ts|jsx|js)$/, '');
    const lowercaseName = baseName.toLowerCase();

    clientImports.push(`import ${componentName} from "${relativePath}";`);
    // Register by full path (for standard RSC)
    clientRegistrations.push(`  "${componentId}": ${componentName},`);
    // Also register by lowercase name (for <Client> wrapper compatibility)
    clientRegistrations.push(`  "${lowercaseName}": ${componentName},`);
  });

  // Get Route Tree from Rust (but DON'T bundle server components)
  const { getRouteTree } = require('./file-scanner');
  let routeTree;
  try {
    routeTree = getRouteTree(appDir);
  } catch (e) {
    console.error('Failed to generate route tree:', e);
    process.exit(1);
  }

  // For RSC, we only serialize the STRUCTURE, not the components
  // Components are loaded separately
  function serializeRouteStructure(node: any): string {
    const props = [];
    props.push(`segment: "${node.segment}"`);
    props.push(`kind: "${node.kind}"`);

    // Store paths as strings, NOT require() - server renders these
    if (node.indexPath) {
      const componentId = path
        .relative(appDir, node.indexPath)
        .replace(/\\/g, '/')
        .replace(/\.(tsx|ts|jsx|js)$/, '');
      props.push(`indexId: "${componentId}"`);
    }
    if (node.layoutPath) {
      const componentId = path
        .relative(appDir, node.layoutPath)
        .replace(/\\/g, '/')
        .replace(/\.(tsx|ts|jsx|js)$/, '');
      props.push(`layoutId: "${componentId}"`);
    }
    if (node.loadingPath) {
      const componentId = path
        .relative(appDir, node.loadingPath)
        .replace(/\\/g, '/')
        .replace(/\.(tsx|ts|jsx|js)$/, '');
      props.push(`loadingId: "${componentId}"`);
    }

    if (node.children && node.children.length > 0) {
      const childrenStr = node.children
        .map((child: any) => serializeRouteStructure(child))
        .join(',\n');
      props.push(`children: [\n${childrenStr}\n]`);
    } else {
      props.push(`children: []`);
    }

    return `{\n${props.join(',\n')}\n}`;
  }

  const routeStructure = serializeRouteStructure(routeTree);

  // TRUE RSC CLIENT ENTRY
  // Only client components are imported here
  const clientEntryContent = `
// Vista Client Entry - TRUE RSC
// Only client components are bundled here
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';

// CLIENT COMPONENTS ONLY (marked with 'use client')
${clientImports.join('\n')}

// Register client components for selective hydration
const CLIENT_COMPONENTS: Record<string, React.ComponentType<any>> = {
${clientRegistrations.join('\n')}
};

// Route structure (NO server component code included)
const routeStructure = ${routeStructure};

// Selective Hydration - Only hydrate client component "islands"
function hydrateClientIslands() {
    const islands = document.querySelectorAll('[data-vista-client]');
    
    if (islands.length === 0) {
        // No client islands, but we still need to hydrate for routing
        const root = document.getElementById('root');
        if (root && root.hasChildNodes()) {
            console.log('[Vista RSC] Server-rendered content, minimal client JS loaded');
        }
        return;
    }
    
    console.log(\`[Vista RSC] Hydrating \${islands.length} client component(s)\`);
    
    islands.forEach((island) => {
        const componentId = island.getAttribute('data-vista-client');
        const propsJson = island.getAttribute('data-props') || '{}';
        
        if (componentId && CLIENT_COMPONENTS[componentId]) {
            const Component = CLIENT_COMPONENTS[componentId];
            const props = JSON.parse(propsJson);
            
            // Hydrate this island
            hydrateRoot(island as HTMLElement, React.createElement(Component, props));
            island.removeAttribute('data-vista-client');
            island.setAttribute('data-hydrated', 'true');
        }
    });
}

// Run hydration
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateClientIslands);
} else {
    hydrateClientIslands();
}

// Hot Module Replacement (HMR) Support
if ((module as any).hot) {
    (module as any).hot.accept();
}

// Server-Side Live Reload (for server component changes)
${
  isDev
    ? `
${getDevToolsIndicatorBootstrapSource(devToolsBootId)}
${getDevErrorOverlayBootstrapSource()}

const sse = new EventSource('${SSE_ENDPOINT}');
sse.onmessage = (event) => {
    if (event.data === 'reload') {
        const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
        if (errorOverlay && typeof errorOverlay.clear === 'function') {
            errorOverlay.clear();
        }
        console.log('[Vista] Server component changed, reloading...');
        const indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
        if (indicator && typeof indicator.pulse === 'function') {
            indicator.pulse('hmr', 460);
        }
        setTimeout(() => window.location.reload(), 80);
        return;
    }
    
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'error' || data.type === 'structure-error') {
            const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
            if (errorOverlay && typeof errorOverlay.show === 'function') {
                errorOverlay.show(data.errors || data.message);
            }
        } else if (data.type === 'ok' || data.type === 'structure-ok') {
            const errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
            if (errorOverlay && typeof errorOverlay.clear === 'function') {
                errorOverlay.clear();
            }
        }
    } catch (e) {
        // Ignore JSON parse errors for non-JSON messages
    }
};

sse.onerror = (e) => {
    console.log('[Vista] SSE connection lost');
};
`
    : '// SSE reload disabled in production'
}

// Export for debugging
(window as any).${CLIENT_COMPONENTS_FLAG} = CLIENT_COMPONENTS;
    `;

  fs.writeFileSync(path.join(vistaDir, 'client.tsx'), clientEntryContent);
  if (_debug) {
    console.log(
      `[Vista JS RSC] Generated client entry with ${clientComponents.length} client component(s)`
    );
  }
}

// Webpack Compiler Instance (reused for watch mode)
let compiler: webpack.Compiler | null = null;

export async function buildClient(
  watch: boolean = false,
  onRebuild?: () => void
): Promise<webpack.Compiler | null> {
  const cwd = process.cwd();
  const vistaDirs = createVistaDirectories(cwd);
  const vistaDir = vistaDirs.root;
  const buildId = getBuildId(vistaDir, !watch);

  if (_debug) console.log(`Building Client (Watch Mode: ${watch}, Bundler: Webpack + SWC)...`);

  // ========================================================================
  // Pre-build Structure Validation
  // ========================================================================
  const vistaConfig = loadConfig(cwd);
  const engineVariant = resolveAndApplyEngineVariant(vistaConfig);
  const structureConfig = resolveStructureValidationConfig(vistaConfig);
  const cacheComponentsConfig = resolveCacheComponentsConfig(vistaConfig);
  if (_debug) console.log(`[vista:build] Engine variant: ${engineVariant}`);

  if (structureConfig.enabled) {
    const result: StructureValidationResult = validateAppStructure({ cwd });
    logValidationResult(result, structureConfig.logLevel);

    if (result.state === 'error' && structureConfig.mode === 'strict') {
      console.error(formatBuildFailTable(result));
      process.exit(1);
    }
    // Warnings: continue build, already logged above.
  }

  // Scan app directory using Rust bindings to get client components
  const appDir = path.join(cwd, 'app');
  const componentsDir = path.join(cwd, 'components');
  let clientComponents: Array<{ relativePath: string; absolutePath: string }> = [];

  if (fs.existsSync(appDir)) {
    if (_debug) {
      console.log(
        `[Vista JS] Using ${isNativeAvailable() ? 'Rust native' : 'JS fallback'} scanner (v${getVersion()})`
      );
    }
    const scanResult = scanAppDirectory(appDir);
    if (_debug) {
      console.log(
        `[Vista JS] Found ${scanResult.clientComponents.length} client components, ${scanResult.serverComponents.length} server components in app/`
      );
    }

    // Store client components for entry generation
    clientComponents = scanResult.clientComponents.map((c) => ({
      relativePath: c.relativePath,
      absolutePath: c.absolutePath,
    }));

    // Log client components
    if (scanResult.clientComponents.length > 0 && _debug) {
      console.log(`[Vista JS] Client components ('use client') from app/:`);
      scanResult.clientComponents.forEach((c) => {
        console.log(`  - ${c.relativePath}`);
      });
    }

    const moduleBoundaryIssues = validateModuleBoundaries({
      appDir,
      extraRoots: fs.existsSync(componentsDir) ? [componentsDir] : [],
      cacheComponentsEnabled: cacheComponentsConfig.enabled,
    }).issues;
    if (moduleBoundaryIssues.length > 0) {
      console.log('');
      console.log('\x1b[41m\x1b[37m ERROR \x1b[0m \x1b[31mServer/Segment Validation Error\x1b[0m');
      console.log('');

      for (const issue of moduleBoundaryIssues) {
        console.log(`\x1b[31m✗\x1b[0m ${path.relative(cwd, issue.filePath)}`);
        console.log(`  ${issue.message}`);
        console.log('');
        if (issue.fix) {
          console.log(`  \x1b[36mTo fix:\x1b[0m ${issue.fix}`);
          console.log('');
        }
      }

      if (!watch) {
        console.log('\x1b[31mBuild failed due to server/segment violations.\x1b[0m');
        process.exit(1);
      }
    }
  }

  // Also scan components directory (outside app folder) for client components
  if (fs.existsSync(componentsDir)) {
    if (_debug) console.log(`[Vista JS] Scanning components/ directory...`);
    const componentsScanResult = scanAppDirectory(componentsDir);

    // Map relativePath to include 'components/' prefix for proper resolution
    const componentsClientList = componentsScanResult.clientComponents.map((c) => ({
      relativePath: 'components/' + c.relativePath,
      absolutePath: c.absolutePath,
    }));

    clientComponents = [...clientComponents, ...componentsClientList];

    if (componentsScanResult.clientComponents.length > 0 && _debug) {
      console.log(`[Vista JS] Client components ('use client') from components/:`);
      componentsScanResult.clientComponents.forEach((c) => {
        console.log(`  - components/${c.relativePath}`);
      });
    }
  }

  if (_debug) console.log(`[Vista JS] Total client components: ${clientComponents.length}`);

  // Write canonical artifact manifests for legacy mode.
  try {
    const { getRouteTree } = require('./file-scanner');
    const routeTree = getRouteTree(appDir);
    const routes = collectRouteArtifactEntries(routeTree);
    writeCanonicalVistaArtifacts(cwd, vistaDir, buildId, routes);
  } catch (error) {
    // Keep build behavior resilient in environments where route scan fails.
    writeCanonicalVistaArtifacts(cwd, vistaDir, buildId, []);
    console.warn(`[vista:build] Failed to derive route artifacts: ${(error as Error).message}`);
  }
  writeReservedVistaArtifacts(vistaDir, {
    buildId,
    engineVariant,
    imagesConfig: vistaConfig.images,
  });

  // Generate client entry - TRUE RSC: only client components
  generateClientEntry(cwd, vistaDir, clientComponents, watch);

  // Create Webpack config
  const config = createWebpackConfig({
    cwd,
    isDev: watch,
    engineVariant,
    cacheComponentsEnabled: cacheComponentsConfig.enabled,
  });

  // Create Webpack compiler
  compiler = webpack(config);

  if (watch) {
    // In watch mode, we return the compiler for use with dev middleware
    // Initial CSS build
    runPostCSS(cwd, vistaDir);

    // Watch CSS + source files that may affect Tailwind output.
    const chokidar = require('chokidar');
    try {
      const styleWatchRoots = ['app', 'components', 'content', 'lib', 'ctx', 'data']
        .map((entry) => path.join(cwd, entry))
        .filter((entry) => fs.existsSync(entry));
      let cssTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleCSSBuild = () => {
        if (cssTimer) clearTimeout(cssTimer);
        cssTimer = setTimeout(() => {
          if (_debug) console.log('Style source changed, rebuilding CSS...');
          runPostCSS(cwd, vistaDir);
        }, 120);
      };

      chokidar
        .watch(styleWatchRoots, {
          ignoreInitial: true,
          ignored: (watchedPath: string) =>
            watchedPath.includes(`${path.sep}node_modules${path.sep}`) ||
            watchedPath.includes(`${path.sep}.git${path.sep}`) ||
            watchedPath.includes(`${path.sep}.vista${path.sep}`),
        })
        .on('all', (_event: string, changedPath: string) => {
          if (/\.(?:css|[cm]?[jt]sx?|md|mdx)$/i.test(changedPath)) {
            scheduleCSSBuild();
          }
        });
    } catch (e) {
      // chokidar not installed, skip CSS watch
    }

    if (_debug) console.log('Webpack compiler ready for dev middleware.');
    return compiler;
  } else {
    // Production build
    return new Promise((resolve, reject) => {
      compiler!.run((err, stats) => {
        if (err) {
          console.error('Webpack build error:', err);
          reject(err);
          return;
        }
        if (stats?.hasErrors()) {
          console.error('Webpack compilation errors:', stats.toString('errors-only'));
          reject(new Error('Compilation failed'));
          return;
        }
        console.log('Webpack build complete!');
        console.log(stats?.toString('minimal'));

        // Build CSS
        runPostCSS(cwd, vistaDir);
        generateDeploymentOutputs({
          cwd,
          vistaDir,
          debug: _debug,
        });
        pruneEmptyVistaDirectories(vistaDir);

        compiler!.close((closeErr) => {
          if (closeErr) console.error('Error closing compiler:', closeErr);
          resolve(null);
        });
      });
    });
  }
}

export { compiler };
