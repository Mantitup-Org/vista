import fs from 'fs';
import path from 'path';

import type { DeployContext } from './types';
import { copyDirectoryRecursive, copyStaticHostAssets, ensureDir, writeFileIfAllowed } from './utils';

export function isStaticOnlyDeploy(ctx: DeployContext): boolean {
  return ctx.deployConfig.output === 'static';
}

export function resolveStandaloneServerPath(ctx: DeployContext): string {
  return path.join(ctx.vistaDir, 'standalone', 'server.js');
}

export function copyStandaloneRuntime(ctx: DeployContext, targetDir: string): void {
  const standaloneDir = path.join(ctx.vistaDir, 'standalone');
  copyDirectoryRecursive(standaloneDir, targetDir);
}

export function packRuntimeNodeModules(cwd: string, destDir: string): void {
  const nodeModules = path.join(cwd, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    copyDirectoryRecursive(nodeModules, path.join(destDir, 'node_modules'));
  }
  const packageJson = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJson)) {
    fs.copyFileSync(packageJson, path.join(destDir, 'package.json'));
  }
}

export const VERCEL_SSR_FUNCTION_NAME = 'index';

export function writeVercelNodeHandler(funcDir: string): void {
  ensureDir(funcDir);
  const handler = `#!/usr/bin/env node
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VISTA_ARTIFACT_ROOT = process.env.VISTA_ARTIFACT_ROOT || __dirname;
process.chdir(__dirname);

let standalone;
try {
  standalone = require(path.join(__dirname, '.vista', 'standalone', 'server.js'));
} catch (err) {
  standalone = {
    createRequestListener: () => (req, res) => {
      res.statusCode = 500;
      res.end('Vista SSR handler successfully deployed, but .vista/standalone/server.js is missing. Please run \`vista build\` before deployment.');
    }
  };
}

const listener = standalone.createRequestListener
  ? standalone.createRequestListener()
  : standalone.startStandaloneServer({ listen: false });

module.exports = function vistaHandler(req, res) {
  return listener(req, res);
};
`;
  fs.writeFileSync(path.join(funcDir, 'index.js'), handler, 'utf8');
  fs.writeFileSync(
    path.join(funcDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs20.x',
        handler: 'index.js',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        supportsResponseStreaming: true,
        maxDuration: 60,
        memory: 1024,
      },
      null,
      2
    ),
    'utf8'
  );
}

export function writeNetlifySsrHandler(functionDir: string): void {
  ensureDir(functionDir);
  const handler = `const path = require('path');
const http = require('http');
const stream = require('stream');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VISTA_ARTIFACT_ROOT = process.env.VISTA_ARTIFACT_ROOT || __dirname;
process.chdir(__dirname);

let standalone;
try {
  standalone = require(path.join(__dirname, '.vista', 'standalone', 'server.js'));
} catch (err) {
  standalone = {
    createRequestListener: () => (req, res) => {
      res.statusCode = 500;
      res.end('Vista SSR handler successfully deployed, but .vista/standalone/server.js is missing. Please run \`vista build\` before deployment.');
    }
  };
}

const listener = standalone.createRequestListener
  ? standalone.createRequestListener()
  : standalone.startStandaloneServer({ listen: false });

function queryFromEvent(event) {
  if (event.rawQuery) return '?' + event.rawQuery;
  const params = event.multiValueQueryStringParameters || event.queryStringParameters || {};
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
    } else if (value != null) {
      search.append(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? '?' + encoded : '';
}

function normalizeHeaders(raw) {
  const headers = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value == null) continue;
    headers[String(key).toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
  }
  return headers;
}

function createIncomingMessage(event) {
  const socket = new stream.Duplex({
    read() {},
    write(_chunk, _enc, cb) { cb(); },
  });
  socket.remoteAddress = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || '127.0.0.1';
  socket.encrypted = true;
  socket.destroy = function destroy() {};

  const req = new http.IncomingMessage(socket);
  req.method = event.httpMethod || event.method || 'GET';
  req.url = (event.path || event.rawPath || '/') + queryFromEvent(event);
  req.headers = normalizeHeaders(event.headers);
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body)
    : null;
  if (body && body.length) {
    req.push(body);
  }
  req.push(null);
  return req;
}

function createServerResponse(req) {
  const chunks = [];
  const res = new http.ServerResponse(req);
  const sink = new stream.Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  res.assignSocket(sink);
  res.flushHeaders = res.flushHeaders || function flushHeaders() {
    if (!this._header) this._implicitHeader();
  };
  return {
    res,
    getBody() {
      return Buffer.concat(chunks);
    },
  };
}

function toLambdaResponse(res, body) {
  const headers = {};
  const multiValueHeaders = {};
  const raw = typeof res.getHeaders === 'function' ? res.getHeaders() : {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      multiValueHeaders[key] = value.map((entry) => String(entry));
    } else if (value != null) {
      headers[key] = String(value);
    }
  }
  return {
    statusCode: res.statusCode || 200,
    headers,
    multiValueHeaders,
    body: body.toString('base64'),
    isBase64Encoded: true,
  };
}

exports.handler = async function handler(event) {
  const req = createIncomingMessage(event);
  const { res, getBody } = createServerResponse(req);

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(toLambdaResponse(res, getBody()));
    };
    res.once('finish', finish);
    res.once('close', finish);
    res.once('error', reject);
    try {
      const handled = listener(req, res);
      if (handled && typeof handled.then === 'function') {
        handled.catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
};
`;
  fs.writeFileSync(path.join(functionDir, 'ssr.js'), handler, 'utf8');
}

export function writeCloudflareContainerWorker(outputDir: string): void {
  ensureDir(outputDir);
  const worker = `export class VistaSSR {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const container = this.ctx.container;
    if (!container) {
      return new Response(
        'Vista SSR container is not available. Enable Cloudflare Containers or run the generated Dockerfile on a Node host.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }

    if (!container.running) {
      await container.start({
        env: {
          NODE_ENV: 'production',
          PORT: '3003',
        },
      });
    }

    return container.getTcpPort(3003).fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const id = env.VISTA_SSR.idFromName('vista');
    return env.VISTA_SSR.get(id).fetch(request);
  },
};
`;
  fs.writeFileSync(path.join(outputDir, 'worker.js'), worker, 'utf8');
}

export function writeCloudflareFullRuntimeToml(ctx: DeployContext): string {
  const targetFile = path.join(ctx.cwd, 'wrangler.toml');
  const content = `name = "vista-app"
compatibility_date = "2026-09-20"
main = ".vista/deploy/cloudflare/worker.js"

[vars]
VISTA_RUNTIME = "standalone"

# Full Flight SSR runs in a Node container (same image as vista deploy --target docker).
[[containers]]
class_name = "VistaSSR"
image = "./Dockerfile"
max_instances = 4

[[durable_objects.bindings]]
name = "VISTA_SSR"
class_name = "VistaSSR"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["VistaSSR"]
`;
  writeFileIfAllowed(targetFile, content, ctx.force);
  return targetFile;
}

export function packVercelFullRuntime(ctx: DeployContext): string[] {
  const outputDir = path.join(ctx.cwd, '.vercel', 'output');
  const staticDir = path.join(outputDir, 'static');
  const funcDir = path.join(outputDir, 'functions', `${VERCEL_SSR_FUNCTION_NAME}.func`);

  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDir(staticDir);
  ensureDir(funcDir);

  copyStaticHostAssets(ctx.cwd, ctx.vistaDir, staticDir);
  const vistaStatic = path.join(ctx.vistaDir, 'static');
  if (fs.existsSync(vistaStatic)) {
    copyDirectoryRecursive(vistaStatic, path.join(staticDir, '_vista', 'static'));
  }

  // Keep the standalone layout: <root>/.vista/standalone/server.js so projectRoot is <root>.
  copyDirectoryRecursive(ctx.vistaDir, path.join(funcDir, '.vista'));
  packRuntimeNodeModules(ctx.cwd, funcDir);

  writeVercelNodeHandler(funcDir);

  const config = {
    version: 3,
    routes: [
      {
        src: '^/_vista/static/(.*)$',
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        dest: '/_vista/static/$1',
      },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/' },
    ],
  };
  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(config, null, 2));
  return [outputDir, funcDir, staticDir];
}
