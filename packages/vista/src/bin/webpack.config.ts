import path from 'path';
import webpack from 'webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { VistaServerComponentPlugin } from './server-component-plugin';
import { VistaFlightPlugin } from '../build/webpack/plugins/vista-flight-plugin';
import { BUILD_DIR, FLASH_DIR } from '../constants';
import type { VistaEngineVariant } from '../config';

export interface WebpackConfigOptions {
  cwd: string;
  isDev: boolean;
  engineVariant?: VistaEngineVariant;
  cacheComponentsEnabled?: boolean;
}

export function createWebpackConfig(options: WebpackConfigOptions): webpack.Configuration {
  const { cwd, isDev, engineVariant = 'default', cacheComponentsEnabled = false } = options;
  const vistaDir = path.join(cwd, BUILD_DIR);
  const flashDir = path.join(cwd, FLASH_DIR);
  const entryPoint = path.join(vistaDir, 'client.tsx');

  // Find React - check local node_modules first, then traverse up for monorepo hoisting
  const findModulePath = (moduleName: string): string => {
    const localPath = path.resolve(cwd, 'node_modules', moduleName);
    if (require('fs').existsSync(localPath)) {
      return localPath;
    }
    // Try to resolve from cwd (will traverse up)
    try {
      return path.dirname(require.resolve(`${moduleName}/package.json`, { paths: [cwd] }));
    } catch {
      // Fallback to framework's node_modules
      return path.dirname(require.resolve(`${moduleName}/package.json`));
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
          cacheDirectory:
            engineVariant === 'flashpack'
              ? path.join(flashDir, 'cache', 'webpack')
              : path.join(cwd, 'node_modules', '.cache', 'vista-webpack'),
          buildDependencies: {
            config: [__filename],
          },
        }
      : false,
    // Optimize module resolution for faster HMR
    snapshot: isDev
      ? {
          managedPaths: [path.resolve(cwd, 'node_modules')],
          immutablePaths: [],
        }
      : undefined,
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      alias: {
        react: reactPath,
        'react-dom': reactDomPath,
        'react/jsx-runtime': path.join(reactPath, 'jsx-runtime'),
        'react/jsx-dev-runtime': path.join(reactPath, 'jsx-dev-runtime'),
      },
      modules: [
        path.resolve(cwd, 'node_modules'),
        path.resolve(__dirname, '..', '..', 'node_modules'),
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
            MiniCssExtractPlugin.loader,
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
      new VistaServerComponentPlugin({
        appDir: path.join(cwd, 'app'),
        componentsDir: path.join(cwd, 'components'),
        cacheComponentsEnabled,
      }),
      // Vista Flight Plugin - RSC bundle separation and manifest
      new VistaFlightPlugin({ appDir: path.join(cwd, 'app'), dev: isDev }),
      ...(isDev
        ? [
            new webpack.HotModuleReplacementPlugin(),
            new ReactRefreshWebpackPlugin({
              overlay: false, // Disable built-in overlay, use Vista's error overlay
            }),
          ]
        : []),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
        'process.env.VISTA_ENGINE': JSON.stringify(engineVariant),
        'process.env.VISTA_ENGINE_VARIANT': JSON.stringify(engineVariant),
      }),
      new MiniCssExtractPlugin({
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
