# Vista.js

Vista.js is a React 19 framework with App Router conventions, React Server Components, standalone `.vista` output, and a dual-engine model:

- `default`: the main webpack-backed RSC/SSR engine
- `flashpack`: a Rust-backed engine path that records graph/runtime state in `.flash`

Official site: https://vista-js.vercel.app

Repository: https://github.com/Mantitup-Org/vista

## Packages

| Package | Purpose |
| --- | --- |
| `@vistagenic/vista` | Framework runtime, CLI, server/client exports, cache APIs, fonts, theme APIs |
| `create-vista-app` | Scaffolds Vista apps with engine selection and package-manager prompts |
| `vista-native` | Internal Rust/NAPI bridge used by the repo |

## Current Capabilities

Vista currently ships the following core surface:

- App Router-style file conventions under `app/`
- React Server Components and streaming SSR
- Server Actions and runtime action manifests
- Cache APIs: `unstable_cache`, `revalidateTag`, `revalidatePath`, `cacheTag`, `cacheLife`
- Route groups, parallel routes, interception routes, slot defaults, loading/error/not-found boundaries
- Segment config support (`dynamic`, `revalidate`, `runtime`, `preferredRegion`, `maxDuration`, `fetchCache`)
- Standalone `.vista` output with manifests, file tracing, PPR shell artifacts, and runtime metadata
- Flashpack `.flash` runtime state for `dev`, `build`, and `start`
- Metadata route support through app files like `app/(seo)/sitemap.ts`, `robots.ts`, and `manifest.ts`
- File-based API routes (`app/api/**/route.ts` and `src/app/api/**/route.ts`) with dynamic segments, full HTTP verb dispatch, and streaming Web API `Response`
- Root & `src/` middleware system (`middleware.ts`) with `{ request, next }` signature, custom header mutation, and route matchers
- Native AI Application Framework (`vista/ai`) with `agent()`, structured `tool()` definitions, conversational memory, streaming, and multi-provider abstraction (OpenAI, Anthropic, Google Gemini, Ollama)
- Zero-config deployment adapters (`vista/adapters`) targeting Node.js Standalone, Vercel Build Output v3, Cloudflare Workers, Render, and Docker
- Package-level theme primitives via `vista/theme`
- Experimental typed API package surface via `vista/stack` and `vista/stack/client`

## Quick Start

Create a default app:

```bash
npx create-vista-app@latest my-app
cd my-app
npm run dev
```

Create a Flashpack app:

```bash
npx create-vista-app@latest my-app --engine flashpack
cd my-app
npm run dev
```

Create a typed API starter:

```bash
npx create-vista-app@latest my-app --typed-api
```

By default, generated apps use the same commands regardless of engine:

```bash
npm run dev
npm run build
npm run start
```

The selected engine is stored in `vista.config.ts`.

## Full-Stack & AI-Native Features

> A complete reference full-stack and AI-native application demonstrating file-based API routes (`app/api/users`), AI chat streaming (`app/api/chat`), and middleware is provided in the [`sample-app/`](sample-app/) directory.

### 1. File-Based API Routes

Vista provides zero-config file-based API routes under `app/api/**/route.ts` or `src/app/api/**/route.ts`. Route handlers receive the standard Web Fetch `Request` and route `params` context:

```ts
// app/api/chat/[id]/route.ts
import { NextResponse } from 'vista/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return Response.json({ chatId: id, status: 'active' });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();

  return Response.json({
    chatId: id,
    received: body,
    timestamp: new Date().toISOString(),
  });
}
```

Routes support all standard HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

### 2. Built-in Middleware System

Intercept, inspect, rewrite, or protect routes before they reach page or API handlers using `middleware.ts` (or `src/middleware.ts`):

```ts
// middleware.ts
import type { MiddlewareContext } from 'vista/server';

export async function middleware({ request, next }: MiddlewareContext) {
  const token = request.headers.get('Authorization');

  // Short-circuit unauthorized requests to protected routes
  if (request.url.includes('/api/protected') && !token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Pass request downstream with custom headers
  return next({
    headers: {
      'x-vista-request-id': crypto.randomUUID(),
    },
  });
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
```

#### Middleware Execution Lifecycle & Order

1. **Request Ingestion**: The HTTP request arrives at the Vista runtime engine.
2. **Static Bypass**: Framework internal assets (`/_vista/*`) and public static files bypass middleware for zero-latency static serving.
3. **Matcher Evaluation**: Vista matches the path against `config.matcher` (supports globs like `/api/:path*` and `RegExp` patterns).
4. **Interception & Short-Circuit**: If the middleware returns a `Response` (e.g., 401 Unauthorized or 302 Redirect), it short-circuits immediately without invoking downstream routes.
5. **Header Propagation**: Calling `next({ headers })` forwards control downstream with custom request headers available to both API routes and React Server Components.
6. **Handler Dispatch**: The request proceeds to matched API route handlers (`app/api/**/route.ts`) or page Server Components (`page.tsx`).

### 3. Native AI Application Framework (`vista/ai`)

Vista features a built-in AI orchestrator designed for building production agents, streaming chat interfaces, and tool-augmented workflows:

```ts
// app/api/ai/chat/route.ts
import { agent, tool } from 'vista/ai';

// Define a structured tool with parameter schemas
const weatherTool = tool({
  name: 'getWeather',
  description: 'Get current weather conditions for a given location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  },
  execute: async ({ location }) => {
    return { location, temperature: '72°F', condition: 'Sunny' };
  },
});

// Create an AI agent with multi-provider model abstraction and memory
const assistant = agent({
  model: 'openai:gpt-4o', // or 'anthropic:claude-3-5-sonnet', 'gemini:gemini-1.5-pro', 'ollama:llama3'
  system: 'You are a helpful full-stack Vista.js assistant.',
  tools: [weatherTool],
});

export async function POST(request: Request) {
  const { message } = await request.json();

  // Generate a streaming response with automatic tool-calling and conversation memory
  const result = await assistant.stream(message);

  // Return standard Web API streaming response directly
  return result.toTextStreamResponse();
}
```

### 4. Zero-Config Multi-Cloud Deployment Adapters

Deploy your Vista application anywhere with zero configuration. Adapters are automatically selected based on the runtime environment or via `--adapter`:

- **Node.js Standalone**: Self-contained production runtime with embedded dependencies.
- **Vercel Build Output v3**: Native serverless routing and static optimization (`.vercel/output`).
- **Cloudflare Workers**: Edge deployment with `_worker.js` and `wrangler.toml`.
- **Render**: One-click infrastructure blueprint (`render.yaml`).
- **Docker**: Production-optimized multi-stage Dockerfile and `.dockerignore`.

```bash
# Build for specific cloud target
vista build --adapter vercel
vista build --adapter cloudflare
vista build --adapter docker
```

## Package Examples

Theme provider from the package:

```tsx
import { ThemeProvider, ThemeScript } from 'vista/theme';
```

Cache APIs from the package:

```ts
import { unstable_cache, revalidateTag, revalidatePath } from 'vista/cache';
```

Server helpers from the package:

```ts
import { cookies, headers, draftMode } from 'vista/server';
```

AI framework imports:

```ts
import { agent, tool, createMemory } from 'vista/ai';
```

## Monorepo Layout

```text
vista/
├── apps/
│   └── web/                    # Official website and docs at vista.xyz
├── bench/                      # Vista-first benchmark fixtures
├── crates/                     # Top-level Rust crates and NAPI surface
├── flashpack/                  # Rust-backed Flashpack engine crates
├── packages/
│   ├── vista/                  # Framework package
│   └── create-vista-app/       # Scaffolding CLI
├── scripts/                    # Test, guard, and benchmark helpers
├── task.md                     # Execution ledger / milestone history
├── CONTRIBUTING.md
└── developer.md
```

## Local Development

Install workspace dependencies:

```bash
pnpm install
```

Build the framework package after touching `packages/vista/src`:

```bash
npm --prefix packages/vista run build
```

Build the website:

```bash
npm --prefix apps/web run build
```

Build the native binding when you change `crates/vista-napi`:

```bash
npm --prefix crates/vista-napi run build
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm build` | Build the workspace through `flash-run.cjs` |
| `pnpm dev` | Run workspace dev tasks |
| `pnpm test` | Full repo test chain |
| `pnpm test:integrity` | Framework integrity guard |
| `pnpm test:rsc-conformance` | RSC and route conformance suite |
| `pnpm test:vista-output` | `.vista` standalone/output verification |
| `pnpm test:flashpack-dev` | Flashpack dev/restart verification |
| `pnpm test:flashpack-state` | Flashpack state reuse / cleanup verification |
| `pnpm bench` | Full benchmark run |
| `pnpm bench:quick` | Quick benchmark smoke run |

## Deployment Notes

The repo includes first-party deployment config for the official site:

- `render.yaml`
- `vercel.json`

`apps/web` is the deployment target. Its SEO route files live in `app/(seo)/`, not `public/`.

## Release Flow

Maintainers publish from the `development` branch.

Typical sequence:

```bash
git add -A
git commit -m "release: x.y.z"
git push origin development
npx lerna publish from-package --yes
git tag vx.y.z
git push origin vx.y.z
```

## Learn More

- Repository: https://github.com/Mantitup-Org/vista
- Official site: https://vista-js.vercel.app
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Internal contributor guide: [developer.md](developer.md)
- Benchmark guide: [bench/README.md](bench/README.md)
