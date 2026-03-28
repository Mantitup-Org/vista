"use strict";
/**
 * RSC Webpack Compiler
 *
 * Creates separate webpack configurations for:
 * 1. Server Bundle (.vista/server/) - All app code for SSR
 * 2. Client Bundle (.vista/static/) - Only 'use client' components
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServerWebpackConfig = createServerWebpackConfig;
exports.createClientWebpackConfig = createClientWebpackConfig;
exports.runRSCBuild = runRSCBuild;
const path_1 = __importDefault(require("path"));
const webpack_1 = __importDefault(require("webpack"));
const fs_1 = __importDefault(require("fs"));
const manifest_1 = require("../manifest");
const client_manifest_1 = require("./client-manifest");
const server_manifest_1 = require("./server-manifest");
const react_client_reference_manifest_1 = require("./react-client-reference-manifest");
const constants_1 = require("../../constants");
// Find module path (handles monorepo hoisting)
const findModulePath = (moduleName, cwd) => {
    const localPath = path_1.default.resolve(cwd, 'node_modules', moduleName);
    if (fs_1.default.existsSync(localPath)) {
        return localPath;
    }
    try {
        return path_1.default.dirname(require.resolve(`${moduleName}/package.json`, { paths: [cwd] }));
    }
    catch {
        return path_1.default.dirname(require.resolve(`${moduleName}/package.json`));
    }
};
function resolveFromWorkspace(specifier, cwd) {
    const searchRoots = [
        cwd,
        path_1.default.resolve(cwd, '..'),
        path_1.default.resolve(cwd, '..', '..'),
        path_1.default.resolve(cwd, '..', '..', 'rsc'),
        path_1.default.resolve(cwd, '..', '..', '..'),
        path_1.default.resolve(cwd, '..', '..', '..', 'rsc'),
    ];
    for (const root of searchRoots) {
        try {
            return require.resolve(specifier, { paths: [root] });
        }
        catch {
            // continue
        }
    }
    return require.resolve(specifier);
}
/**
 * Create Server-Side Webpack Configuration
 *
 * Builds ALL components for server-side rendering.
 * Output goes to .vista/server/ and is NEVER sent to the client.
 */
function createServerWebpackConfig(options) {
    const { cwd, isDev, vistaDirs, buildId, engineVariant = 'default' } = options;
    const swcLoaderPath = resolveFromWorkspace('swc-loader', cwd);
    const nullLoaderPath = resolveFromWorkspace('null-loader', cwd);
    const cssLoaderPath = resolveFromWorkspace('css-loader', cwd);
    // Generate server manifest first
    const serverManifest = (0, server_manifest_1.generateServerManifest)(cwd, path_1.default.join(cwd, 'app'));
    fs_1.default.writeFileSync(path_1.default.join(vistaDirs.server, 'server-manifest.json'), JSON.stringify(serverManifest, null, 2));
    return {
        mode: isDev ? 'development' : 'production',
        name: 'server',
        target: 'node',
        // Entry: All pages and layouts for SSR
        entry: () => {
            const entries = {};
            const appDir = path_1.default.join(cwd, 'app');
            // Scan for all page.tsx, layout.tsx files
            function scanDir(dir, prefix = '') {
                if (!fs_1.default.existsSync(dir))
                    return;
                const items = fs_1.default.readdirSync(dir, { withFileTypes: true });
                for (const item of items) {
                    if (item.isDirectory()) {
                        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                            scanDir(path_1.default.join(dir, item.name), prefix + item.name + '/');
                        }
                    }
                    else if (item.isFile()) {
                        const ext = path_1.default.extname(item.name);
                        const base = path_1.default.basename(item.name, ext);
                        if (['.tsx', '.ts', '.jsx', '.js'].includes(ext)) {
                            if (['page', 'layout', 'loading', 'error', 'not-found', 'root', 'index'].includes(base)) {
                                const entryName = (prefix + base).replace(/\//g, '_') || 'root';
                                entries[entryName] = path_1.default.join(dir, item.name);
                            }
                        }
                    }
                }
            }
            scanDir(appDir);
            return entries;
        },
        output: {
            path: path_1.default.join(vistaDirs.server, 'app'),
            filename: '[name].js',
            libraryTarget: 'commonjs2',
            clean: !isDev,
        },
        externals: [
            // Don't bundle node_modules on server
            ({ request }, callback) => {
                if (request &&
                    !request.startsWith('.') &&
                    !request.startsWith('/') &&
                    !path_1.default.isAbsolute(request)) {
                    // External - don't bundle
                    return callback(null, 'commonjs ' + request);
                }
                callback();
            },
        ],
        cache: isDev
            ? (0, manifest_1.getWebpackCacheConfig)(vistaDirs.root, buildId, 'server-development', engineVariant, cwd)
            : false,
        resolve: {
            extensions: ['.tsx', '.ts', '.jsx', '.js'],
            modules: [path_1.default.resolve(cwd, 'node_modules'), 'node_modules'],
        },
        module: {
            rules: [
                {
                    test: /\.[jt]sx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: swcLoaderPath,
                        options: {
                            jsc: {
                                parser: {
                                    syntax: 'typescript',
                                    tsx: true,
                                },
                                transform: {
                                    react: {
                                        runtime: 'automatic',
                                    },
                                },
                                target: 'es2020',
                            },
                            module: {
                                type: 'commonjs',
                            },
                        },
                    },
                },
                {
                    test: /\.module\.css$/,
                    use: [
                        {
                            loader: cssLoaderPath,
                            options: {
                                modules: {
                                    mode: 'local',
                                    localIdentName: isDev ? '[name]__[local]--[hash:base64:5]' : '[hash:base64:8]',
                                    exportOnlyLocals: true, // Server-side: only export class name mappings
                                },
                            },
                        },
                    ],
                },
                {
                    test: /\.css$/,
                    exclude: /\.module\.css$/,
                    use: nullLoaderPath, // Non-module CSS handled separately by PostCSS
                },
            ],
        },
        plugins: [
            new webpack_1.default.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
                'process.env.VISTA_ENGINE': JSON.stringify(engineVariant),
                'process.env.VISTA_ENGINE_VARIANT': JSON.stringify(engineVariant),
                [constants_1.BUILD_ID_DEFINE]: JSON.stringify(buildId),
                [constants_1.SERVER_DEFINE]: 'true',
            }),
        ],
        devtool: isDev ? 'source-map' : false,
        stats: 'minimal',
    };
}
/**
 * Create Client-Side Webpack Configuration (RSC-aware)
 *
 * ONLY bundles components marked with 'use client'.
 * Server components are replaced with client references.
 */
function createClientWebpackConfig(options) {
    const { cwd, isDev, vistaDirs, buildId, engineVariant = 'default', clientReferenceFiles = [] } = options;
    const swcLoaderPath = resolveFromWorkspace('swc-loader', cwd);
    const nullLoaderPath = resolveFromWorkspace('null-loader', cwd);
    const cssLoaderPath = resolveFromWorkspace('css-loader', cwd);
    const MiniCssExtractPlugin = require('mini-css-extract-plugin');
    // Generate client manifest
    const clientManifest = (0, client_manifest_1.generateClientManifest)(cwd, path_1.default.join(cwd, 'app'));
    fs_1.default.writeFileSync(path_1.default.join(vistaDirs.root, 'client-manifest.json'), JSON.stringify(clientManifest, null, 2));
    const reactPath = findModulePath('react', cwd);
    const reactDomPath = findModulePath('react-dom', cwd);
    const reactFlightPluginPath = resolveFromWorkspace('react-server-dom-webpack/plugin', cwd);
    const reactFlightClientPath = resolveFromWorkspace('react-server-dom-webpack/client.browser', cwd);
    const ReactFlightWebpackPlugin = require(reactFlightPluginPath);
    const flightClientReferences = Array.from(new Set(clientReferenceFiles
        .filter((entry) => typeof entry === 'string' && entry.length > 0)
        .map((entry) => path_1.default.resolve(entry))));
    // Entry: Only client components
    const clientEntry = path_1.default.join(vistaDirs.root, 'rsc-client.tsx');
    return {
        mode: isDev ? 'development' : 'production',
        name: 'client',
        target: 'web',
        // No webpack-hot-middleware entry — Vista uses SSE live-reload for RSC
        entry: clientEntry,
        output: {
            path: vistaDirs.chunks,
            filename: isDev ? '[name].js' : 'main-[contenthash:8].js',
            chunkFilename: isDev ? '[name].js' : '[name]-[contenthash:8].js',
            publicPath: constants_1.STATIC_CHUNKS_PATH,
            clean: !isDev,
        },
        // Disable filesystem cache for client RSC build in dev mode.
        // ReactFlightWebpackPlugin uses AsyncDependenciesBlock which has no serializer,
        // causing noisy "No serializer registered" warnings. We already clear the cache
        // dir on every `vista dev` start (see build-rsc.ts), so disk cache provides
        // no benefit. Webpack's in-memory cache still works for HMR recompilations.
        cache: false,
        resolve: {
            extensions: ['.tsx', '.ts', '.jsx', '.js'],
            alias: {
                react: reactPath,
                'react-dom': reactDomPath,
                'react/jsx-runtime': path_1.default.join(reactPath, 'jsx-runtime'),
                'react/jsx-dev-runtime': path_1.default.join(reactPath, 'jsx-dev-runtime'),
                'react-server-dom-webpack/client': reactFlightClientPath,
                // Resolve vista subpath imports for the generated RSC client entry
                'vista/client/rsc-router': path_1.default.resolve(__dirname, '..', '..', 'client', 'rsc-router.js'),
                'vista/client/server-actions': path_1.default.resolve(__dirname, '..', '..', 'client', 'server-actions.js'),
            },
            modules: [
                path_1.default.resolve(cwd, 'node_modules'),
                path_1.default.resolve(__dirname, '..', '..', '..', 'node_modules'),
                'node_modules',
            ],
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                cacheGroups: {
                    framework: {
                        name: 'framework',
                        test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                        priority: 40,
                        chunks: 'all',
                        enforce: true,
                    },
                    vendor: {
                        name: 'vendor',
                        test: /[\\/]node_modules[\\/]/,
                        priority: 30,
                        chunks: 'all',
                    },
                },
            },
            runtimeChunk: {
                name: 'webpack',
            },
            moduleIds: isDev ? 'named' : 'deterministic',
            chunkIds: isDev ? 'named' : 'deterministic',
        },
        module: {
            rules: [
                {
                    test: /\.[jt]sx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: swcLoaderPath,
                        options: {
                            jsc: {
                                parser: {
                                    syntax: 'typescript',
                                    tsx: true,
                                    dynamicImport: true,
                                },
                                transform: {
                                    react: {
                                        runtime: 'automatic',
                                        development: isDev,
                                        refresh: false, // No React Refresh — SSE live-reload handles updates
                                    },
                                },
                                target: 'es2020',
                            },
                            module: {
                                type: 'es6',
                            },
                        },
                    },
                },
                {
                    test: /\.module\.css$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: cssLoaderPath,
                            options: {
                                modules: {
                                    mode: 'local',
                                    localIdentName: isDev ? '[name]__[local]--[hash:base64:5]' : '[hash:base64:8]',
                                },
                            },
                        },
                    ],
                },
                {
                    test: /\.css$/,
                    exclude: /\.module\.css$/,
                    use: nullLoaderPath, // Non-module CSS handled by PostCSS
                },
            ],
        },
        plugins: [
            new ReactFlightWebpackPlugin({
                isServer: false,
                clientManifestFilename: '../../react-client-manifest.json',
                serverConsumerManifestFilename: '../../react-server-manifest.json',
                clientReferences: flightClientReferences.length > 0
                    ? flightClientReferences
                    : [
                        {
                            directory: path_1.default.join(cwd, 'app'),
                            recursive: true,
                            include: /\.[jt]sx?$/,
                        },
                    ],
            }),
            // Post-process the SSR manifest to add `id` and `chunks` fields.
            // ReactFlightWebpackPlugin generates {specifier, name} entries in the
            // server-consumer manifest, but react-server-dom-webpack/client.node
            // expects {id, chunks, name} (so it can call __webpack_require__(id)
            // and preloadModule with the chunks array).
            {
                apply(compiler) {
                    compiler.hooks.make.tap('VistaFlightManifestPatch', (compilation) => {
                        compilation.hooks.processAssets.tap({
                            name: 'VistaFlightManifestPatch',
                            // Run after the Flight plugin (REPORT stage) has emitted assets
                            stage: webpack_1.default.Compilation.PROCESS_ASSETS_STAGE_REPORT + 1,
                        }, () => {
                            const clientAssetName = '../../react-client-manifest.json';
                            const ssrAssetName = '../../react-server-manifest.json';
                            const clientAsset = compilation.getAsset(clientAssetName);
                            const ssrAsset = compilation.getAsset(ssrAssetName);
                            if (clientAsset) {
                                try {
                                    const manifest = JSON.parse(clientAsset.source.source().toString());
                                    const normalized = (0, react_client_reference_manifest_1.normalizeReactClientReferenceManifest)(manifest);
                                    compilation.updateAsset(clientAssetName, new webpack_1.default.sources.RawSource(JSON.stringify(normalized, null, 2), false));
                                }
                                catch {
                                    // If parsing fails, leave the asset as-is
                                }
                            }
                            if (!ssrAsset)
                                return;
                            try {
                                const manifest = JSON.parse(ssrAsset.source.source().toString());
                                if (manifest.moduleMap) {
                                    for (const [moduleId, exports] of Object.entries(manifest.moduleMap)) {
                                        const exportsObj = exports;
                                        for (const [exportName, entry] of Object.entries(exportsObj)) {
                                            if (entry.specifier && !entry.id) {
                                                // Transform: {specifier, name} → {id, chunks, name}
                                                // `id` = the specifier (file:// URL), which our
                                                // __webpack_require__ shim can resolve via fileURLToPath.
                                                // `chunks` = [] because the SSR process has all code locally.
                                                exportsObj[exportName] = {
                                                    id: entry.specifier,
                                                    chunks: [],
                                                    name: entry.name || exportName,
                                                };
                                            }
                                        }
                                    }
                                    (0, react_client_reference_manifest_1.normalizeReactServerConsumerManifest)(manifest);
                                    compilation.updateAsset(ssrAssetName, new webpack_1.default.sources.RawSource(JSON.stringify(manifest, null, 2), false));
                                }
                            }
                            catch {
                                // If parsing fails, leave the asset as-is
                            }
                        });
                    });
                },
            },
            new webpack_1.default.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
                'process.env.VISTA_ENGINE': JSON.stringify(engineVariant),
                'process.env.VISTA_ENGINE_VARIANT': JSON.stringify(engineVariant),
                [constants_1.BUILD_ID_DEFINE]: JSON.stringify(buildId),
                [constants_1.SERVER_DEFINE]: 'false',
            }),
            // No HotModuleReplacementPlugin or ReactRefreshWebpackPlugin
            // RSC client builds use Vista's SSE live-reload (${SSE_ENDPOINT}) instead
            // Extract CSS Modules into a separate file
            new MiniCssExtractPlugin({
                filename: isDev ? 'modules.css' : 'modules-[contenthash:8].css',
                chunkFilename: isDev ? '[name]-modules.css' : '[name]-modules-[contenthash:8].css',
            }),
        ],
        devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
        stats: 'minimal',
    };
}
/**
 * Run both server and client builds
 */
async function runRSCBuild(cwd, isDev) {
    const { createVistaDirectories, getBuildId } = await import('../manifest.js');
    const vistaDirs = createVistaDirectories(cwd, 'rsc');
    const buildId = getBuildId(vistaDirs.root, !isDev);
    const options = { cwd, isDev, vistaDirs, buildId };
    const serverConfig = createServerWebpackConfig(options);
    const clientConfig = createClientWebpackConfig(options);
    const serverCompiler = (0, webpack_1.default)(serverConfig);
    const clientCompiler = (0, webpack_1.default)(clientConfig);
    return { serverCompiler, clientCompiler };
}
