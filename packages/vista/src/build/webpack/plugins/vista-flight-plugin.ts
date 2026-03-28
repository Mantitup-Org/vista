/**
 * Vista Flight Client Entry Plugin
 *
 * Generates lightweight client manifest artifacts for legacy mode.
 * This plugin intentionally stays isolated from Flight RSC mode.
 */

import webpack from 'webpack';
import path from 'path';
import { createComponentId } from '../../rsc/component-identity';
import { CLIENT_MANIFEST_FLAG } from '../../../constants';

interface PluginOptions {
  appDir: string;
  dev: boolean;
}

interface ClientModuleInfo {
  moduleId: string | number;
  absolutePath: string;
  relativePath: string;
  exports: string[];
}

const PLUGIN_NAME = 'VistaFlightPlugin';

export class VistaFlightPlugin {
  private readonly appDir: string;
  private readonly dev: boolean;

  constructor(options: PluginOptions) {
    this.appDir = options.appDir;
    this.dev = options.dev;
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const moduleInfo = this.collectModuleInfo(compilation);
          this.emitClientManifest(compilation, moduleInfo.clientModules);
        }
      );
    });
  }

  private collectModuleInfo(compilation: webpack.Compilation): {
    clientModules: Map<string, ClientModuleInfo>;
    serverModules: Map<string, ClientModuleInfo>;
  } {
    const clientModules = new Map<string, ClientModuleInfo>();
    const serverModules = new Map<string, ClientModuleInfo>();

    const normalizedAppDir = this.appDir.replace(/\\/g, '/').toLowerCase();

    for (const mod of compilation.modules) {
      const normalMod = mod as webpack.NormalModule;
      const resource = normalMod.resource;
      if (!resource) continue;
      if (!/\.(tsx?|jsx?)$/i.test(resource)) continue;

      const normalizedResource = resource.replace(/\\/g, '/').toLowerCase();
      if (!normalizedResource.includes(normalizedAppDir)) continue;

      const buildInfo = (normalMod as any).buildInfo;
      const rscInfo = buildInfo?.rsc;
      if (!rscInfo) continue;

      const moduleId = compilation.chunkGraph.getModuleId(normalMod);
      const moduleInfo: ClientModuleInfo = {
        moduleId: moduleId ?? resource,
        absolutePath: resource,
        relativePath: path.relative(this.appDir, resource).replace(/\\/g, '/'),
        exports: ['default'],
      };

      if (rscInfo.isClientRef) {
        clientModules.set(resource, moduleInfo);
      } else {
        serverModules.set(resource, moduleInfo);
      }
    }

    if (this.dev && process.env.VISTA_DEBUG) {
      console.log(
        `[Vista Flight Plugin] Found ${clientModules.size} client, ${serverModules.size} server modules`
      );
    }

    return { clientModules, serverModules };
  }

  private emitClientManifest(
    compilation: webpack.Compilation,
    clientModules: Map<string, ClientModuleInfo>
  ): void {
    const manifest: {
      clientModules: Record<
        string,
        {
          id: string | number;
          chunks: string[];
          name: string;
          path: string;
        }
      >;
      pathToId: Record<string, string>;
    } = {
      clientModules: {},
      pathToId: {},
    };

    const stableEntries = Array.from(clientModules.entries()).sort((a, b) =>
      a[1].relativePath.localeCompare(b[1].relativePath)
    );

    for (const [, info] of stableEntries) {
      const componentId = createComponentId('client', info.relativePath);
      manifest.clientModules[componentId] = {
        id: info.moduleId,
        chunks: ['client.js'],
        name: 'default',
        path: info.relativePath,
      };
      manifest.pathToId[info.relativePath] = componentId;
    }

    const jsSource = `// Vista Client Reference Manifest
(function() {
  if (typeof window !== 'undefined') {
    window.${CLIENT_MANIFEST_FLAG} = ${JSON.stringify(manifest, null, 2)};
  }
})();`;

    compilation.emitAsset('vista-client-manifest.js', new webpack.sources.RawSource(jsSource));

    if (this.dev) {
      compilation.emitAsset(
        'vista-client-manifest.json',
        new webpack.sources.RawSource(JSON.stringify(manifest, null, 2))
      );
    }
  }
}

export default VistaFlightPlugin;
