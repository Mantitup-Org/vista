"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebpackConfig = createWebpackConfig;
const path_1 = __importDefault(require("path"));
const webpack_1 = __importDefault(require("webpack"));
const react_refresh_webpack_plugin_1 = __importDefault(require("@pmmmwh/react-refresh-webpack-plugin"));
const mini_css_extract_plugin_1 = __importDefault(require("mini-css-extract-plugin"));
const server_component_plugin_1 = require("./server-component-plugin");
const vista_flight_plugin_1 = require("../build/webpack/plugins/vista-flight-plugin");
const constants_1 = require("../constants");
function createWebpackConfig(options) {
    const { cwd, isDev, engineVariant = 'default', cacheComponentsEnabled = false } = options;
    const vistaDir = path_1.default.join(cwd, constants_1.BUILD_DIR);
    const flashDir = path_1.default.join(cwd, constants_1.FLASH_DIR);
    const entryPoint = path_1.default.join(vistaDir, 'client.tsx');
    // Find React - check local node_modules first, then traverse up for monorepo hoisting
    const findModulePath = (moduleName) => {
        const localPath = path_1.default.resolve(cwd, 'node_modules', moduleName);
        if (require('fs').existsSync(localPath)) {
            return localPath;
        }
        // Try to resolve from cwd (will traverse up)
        try {
            return path_1.default.dirname(require.resolve(`${moduleName}/package.json`, { paths: [cwd] }));
        }
        catch {
            // Fallback to framework's node_modules
            return path_1.default.dirname(require.resolve(`${moduleName}/package.json`));
        }
    };
    const reactPath = findModulePath('react');
    const reactDomPath = findModulePath('react-dom');
    // Resolve webpack-hot-middleware/client from Vista's own node_modules
    // so it works even with file: or link: dependencies
    const hmrClientPath = require.resolve('webpack-hot-middleware/client');
    return {
        mode: isDev ? 'development' : 'production',
        entry: isDev
            ? [
                // HMR runtime - reload=true for full page reload on unaccepted modules
                // noInfo to reduce console noise, overlay=false to use Vista's error overlay
                hmrClientPath +
                    '?path=/__webpack_hmr&timeout=20000&reload=true&noInfo=true&overlay=false',
                entryPoint,
            ]
            : entryPoint,
        output: {
            path: vistaDir,
            filename: 'client.js',
            publicPath: '/',
            clean: false, // Don't clean .vista folder
        },
        // Webpack 5 Persistent Caching - dramatically faster rebuilds
        cache: isDev
            ? {
                type: 'filesystem',
                cacheDirectory: engineVariant === 'flashpack'
                    ? path_1.default.join(flashDir, 'cache', 'webpack')
                    : path_1.default.join(cwd, 'node_modules', '.cache', 'vista-webpack'),
                buildDependencies: {
                    config: [__filename],
                },
            }
            : false,
        // Optimize module resolution for faster HMR
        snapshot: isDev
            ? {
                managedPaths: [path_1.default.resolve(cwd, 'node_modules')],
                immutablePaths: [],
            }
            : undefined,
        resolve: {
            extensions: ['.tsx', '.ts', '.jsx', '.js'],
            alias: {
                react: reactPath,
                'react-dom': reactDomPath,
                'react/jsx-runtime': path_1.default.join(reactPath, 'jsx-runtime'),
                'react/jsx-dev-runtime': path_1.default.join(reactPath, 'jsx-dev-runtime'),
            },
            modules: [
                path_1.default.resolve(cwd, 'node_modules'),
                path_1.default.resolve(__dirname, '..', '..', 'node_modules'),
                'node_modules',
            ],
        },
        module: {
            rules: [
                {
                    test: /\.[jt]sx?$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: require.resolve('swc-loader'),
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
                                            refresh: isDev, // Enable React Fast Refresh
                                        },
                                    },
                                    target: 'es2020',
                                },
                                module: {
                                    type: 'es6',
                                },
                            },
                        },
                        {
                            // Vista Flight Loader - marks modules with RSC info
                            // Runs FIRST (loaders execute bottom-to-top) to see original source
                            loader: require.resolve('../build/webpack/loaders/vista-flight-loader'),
                        },
                    ],
                },
                {
                    test: /\.module\.css$/,
                    use: [
                        mini_css_extract_plugin_1.default.loader,
                        {
                            loader: 'css-loader',
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
                    use: 'null-loader', // Non-module CSS handled by PostCSS
                },
            ],
        },
        plugins: [
            // Server Component enforcement - runs on every compile
            new server_component_plugin_1.VistaServerComponentPlugin({
                appDir: path_1.default.join(cwd, 'app'),
                componentsDir: path_1.default.join(cwd, 'components'),
                cacheComponentsEnabled,
            }),
            // Vista Flight Plugin - RSC bundle separation and manifest
            new vista_flight_plugin_1.VistaFlightPlugin({ appDir: path_1.default.join(cwd, 'app'), dev: isDev }),
            ...(isDev
                ? [
                    new webpack_1.default.HotModuleReplacementPlugin(),
                    new react_refresh_webpack_plugin_1.default({
                        overlay: false, // Disable built-in overlay, use Vista's error overlay
                    }),
                ]
                : []),
            new webpack_1.default.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
                'process.env.VISTA_ENGINE': JSON.stringify(engineVariant),
                'process.env.VISTA_ENGINE_VARIANT': JSON.stringify(engineVariant),
            }),
            new mini_css_extract_plugin_1.default({
                filename: isDev ? 'modules.css' : 'modules-[contenthash:8].css',
                chunkFilename: isDev ? '[name]-modules.css' : '[name]-modules-[contenthash:8].css',
            }),
        ],
        devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
        stats: 'minimal',
        infrastructureLogging: {
            level: 'warn',
        },
    };
}
