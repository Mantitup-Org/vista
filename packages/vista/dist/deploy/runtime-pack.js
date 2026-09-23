"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERCEL_SSR_FUNCTION_NAME = void 0;
exports.isStaticOnlyDeploy = isStaticOnlyDeploy;
exports.resolveStandaloneServerPath = resolveStandaloneServerPath;
exports.copyStandaloneRuntime = copyStandaloneRuntime;
exports.packRuntimeNodeModules = packRuntimeNodeModules;
exports.writeVercelNodeHandler = writeVercelNodeHandler;
exports.writeNetlifySsrHandler = writeNetlifySsrHandler;
exports.writeCloudflareContainerWorker = writeCloudflareContainerWorker;
exports.writeCloudflareFullRuntimeToml = writeCloudflareFullRuntimeToml;
exports.packVercelFullRuntime = packVercelFullRuntime;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
function isStaticOnlyDeploy(ctx) {
    if (ctx.deployConfig.output === 'static') {
        return true;
    }
    if (ctx.target === 'cloudflare') {
        if (ctx.config.deploy?.output === 'standalone') {
            return false;
        }
        if (process.env.CF_PAGES === '1' || process.env.CLOUDFLARE_PAGES) {
            return true;
        }
        const wranglerPath = path_1.default.join(ctx.cwd, 'wrangler.toml');
        if (fs_1.default.existsSync(wranglerPath)) {
            const content = fs_1.default.readFileSync(wranglerPath, 'utf8');
            if (content.includes('pages_build_output_dir')) {
                return true;
            }
            if (content.includes('[[containers]]') || content.includes('main =')) {
                return false;
            }
        }
    }
    return false;
}
function resolveStandaloneServerPath(ctx) {
    return path_1.default.join(ctx.vistaDir, 'standalone', 'server.js');
}
function copyStandaloneRuntime(ctx, targetDir) {
    const standaloneDir = path_1.default.join(ctx.vistaDir, 'standalone');
    (0, utils_1.copyDirectoryRecursive)(standaloneDir, targetDir);
}
function packRuntimeNodeModules(cwd, destDir) {
    const nodeModules = path_1.default.join(cwd, 'node_modules');
    if (fs_1.default.existsSync(nodeModules)) {
        (0, utils_1.copyDirectoryRecursive)(nodeModules, path_1.default.join(destDir, 'node_modules'));
    }
    const packageJson = path_1.default.join(cwd, 'package.json');
    if (fs_1.default.existsSync(packageJson)) {
        fs_1.default.copyFileSync(packageJson, path_1.default.join(destDir, 'package.json'));
    }
}
exports.VERCEL_SSR_FUNCTION_NAME = 'index';
function writeVercelNodeHandler(funcDir) {
    (0, utils_1.ensureDir)(funcDir);
    const handler = `#!/usr/bin/env node
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VISTA_ARTIFACT_ROOT = process.env.VISTA_ARTIFACT_ROOT || __dirname;
process.chdir(__dirname);

const standalone = require(path.join(__dirname, '.vista', 'standalone', 'server.js'));
const listener = standalone.createRequestListener
  ? standalone.createRequestListener()
  : standalone.startStandaloneServer({ listen: false });

module.exports = function vistaHandler(req, res) {
  return listener(req, res);
};
`;
    fs_1.default.writeFileSync(path_1.default.join(funcDir, 'index.js'), handler, 'utf8');
    fs_1.default.writeFileSync(path_1.default.join(funcDir, '.vc-config.json'), JSON.stringify({
        runtime: 'nodejs20.x',
        handler: 'index.js',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        supportsResponseStreaming: true,
        maxDuration: 60,
        memory: 1024,
    }, null, 2), 'utf8');
}
function writeNetlifySsrHandler(functionDir) {
    (0, utils_1.ensureDir)(functionDir);
    const handler = `const path = require('path');
const http = require('http');
const stream = require('stream');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VISTA_ARTIFACT_ROOT = process.env.VISTA_ARTIFACT_ROOT || __dirname;
process.chdir(__dirname);

const standalone = require(path.join(__dirname, '.vista', 'standalone', 'server.js'));
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
  // No-op socket so ServerResponse can operate; we never read wire bytes from it.
  const sink = new stream.Writable({
    write(_chunk, _enc, cb) { cb(); },
    final(cb) { cb(); },
  });
  res.assignSocket(sink);
  res.flushHeaders = res.flushHeaders || function flushHeaders() {
    if (!this._header) this._implicitHeader();
  };
  // Capture application body bytes only. assignSocket() would otherwise make
  // ServerResponse serialize the status line, headers and chunked transfer
  // framing into the socket, and those wire bytes must not leak into the
  // Lambda body. Status and headers are reported separately via res.getHeaders().
  const pushChunk = (chunk, enc) => {
    if (chunk == null || chunk.length === 0) return;
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8')
    );
  };
  // Route writeHead(status[, message][, headers]) through setHeader so the
  // headers are reported by res.getHeaders() (they would otherwise only exist
  // in the now-suppressed wire output).
  res.writeHead = function writeHead(statusCode, statusMessage, headers) {
    res.statusCode = statusCode;
    let headerObj = headers;
    if (statusMessage && typeof statusMessage === 'object') {
      headerObj = statusMessage;
    } else if (typeof statusMessage === 'string') {
      res.statusMessage = statusMessage;
    }
    if (headerObj) {
      for (const key of Object.keys(headerObj)) {
        if (headerObj[key] != null) res.setHeader(key, headerObj[key]);
      }
    }
    return res;
  };
  res.write = function write(chunk, enc, cb) {
    if (typeof enc === 'function') { cb = enc; enc = undefined; }
    pushChunk(chunk, enc);
    if (typeof cb === 'function') cb();
    return true;
  };
  let ended = false;
  res.end = function end(chunk, enc, cb) {
    if (typeof chunk === 'function') { cb = chunk; chunk = undefined; enc = undefined; }
    else if (typeof enc === 'function') { cb = enc; enc = undefined; }
    pushChunk(chunk, enc);
    if (!ended) {
      ended = true;
      res.emit('finish');
    }
    if (typeof cb === 'function') cb();
    return res;
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
    fs_1.default.writeFileSync(path_1.default.join(functionDir, 'ssr.js'), handler, 'utf8');
}
function writeCloudflareContainerWorker(outputDir) {
    (0, utils_1.ensureDir)(outputDir);
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
    fs_1.default.writeFileSync(path_1.default.join(outputDir, 'worker.js'), worker, 'utf8');
}
function writeCloudflareFullRuntimeToml(ctx) {
    const targetFile = path_1.default.join(ctx.cwd, 'wrangler.toml');
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
    (0, utils_1.writeFileIfAllowed)(targetFile, content, ctx.force);
    return targetFile;
}
function packVercelFullRuntime(ctx) {
    const outputDir = path_1.default.join(ctx.cwd, '.vercel', 'output');
    const staticDir = path_1.default.join(outputDir, 'static');
    const funcDir = path_1.default.join(outputDir, 'functions', `${exports.VERCEL_SSR_FUNCTION_NAME}.func`);
    fs_1.default.rmSync(outputDir, { recursive: true, force: true });
    (0, utils_1.ensureDir)(staticDir);
    (0, utils_1.ensureDir)(funcDir);
    (0, utils_1.copyStaticHostAssets)(ctx.cwd, ctx.vistaDir, staticDir);
    const vistaStatic = path_1.default.join(ctx.vistaDir, 'static');
    if (fs_1.default.existsSync(vistaStatic)) {
        (0, utils_1.copyDirectoryRecursive)(vistaStatic, path_1.default.join(staticDir, '_vista', 'static'));
    }
    // Keep the standalone layout: <root>/.vista/standalone/server.js so projectRoot is <root>.
    (0, utils_1.copyDirectoryRecursive)(ctx.vistaDir, path_1.default.join(funcDir, '.vista'));
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
    fs_1.default.writeFileSync(path_1.default.join(outputDir, 'config.json'), JSON.stringify(config, null, 2));
    return [outputDir, funcDir, staticDir];
}
