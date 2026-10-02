export type FullstackApisRunResult =
  | {
      ok: true;
      status: number;
      body: unknown;
      meta: string;
    }
  | {
      ok: false;
      error: string;
      meta?: string;
    };

type MockResponseInit = { status?: number };

function createMockResponse() {
  return {
    json(data: unknown, init?: MockResponseInit) {
      return {
        __vistaMock: true as const,
        status: init?.status ?? 200,
        data,
        async json() {
          return data;
        },
        get ok() {
          return (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300;
        },
      };
    },
  };
}

function stripExports(source: string): string {
  return source
    .replace(/^\s*export\s+async\s+function/gm, 'async function')
    .replace(/^\s*export\s+function/gm, 'function')
    .replace(/^\s*export\s+const/gm, 'const')
    .replace(/^\s*export\s+\{[^}]*\}\s*;?/gm, '');
}

function assertSafeSource(source: string): void {
  const hardBanned =
    /\b(import\s|require\s*\(|eval\s*\(|Function\s*\(|process\.|globalThis|XMLHttpRequest|WebSocket|Worker|localStorage|indexedDB)\b/;
  if (hardBanned.test(source)) {
    throw new Error('This playground only allows handler / page snippets (no imports or host APIs).');
  }
}

export async function runRouteSource(
  source: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<FullstackApisRunResult> {
  try {
    assertSafeSource(source);
    if (/\bfetch\s*\(/.test(source)) {
      return {
        ok: false,
        error: 'Route handlers should return Response.json — fetch belongs in the page.',
      };
    }

    const Response = createMockResponse();
    const prepared = stripExports(source);
    const runner = new Function(
      'Response',
      `${prepared}\n; return typeof ${method} === 'function' ? ${method}() : null;`
    );
    const result = await Promise.resolve(runner(Response));
    if (!result || !result.__vistaMock) {
      return {
        ok: false,
        error: `No ${method}() handler returned Response.json(...).`,
      };
    }
    return {
      ok: true,
      status: result.status,
      body: result.data,
      meta: `${method} · ${result.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runPageSource(
  source: string,
  options: {
    sameOrigin: boolean;
    resolveRouteSource: (url: string) => string | null;
  }
): Promise<FullstackApisRunResult> {
  try {
    assertSafeSource(source);

    const fetchMock = async (input: string) => {
      const url = String(input);
      if (!options.sameOrigin && /^https?:\/\//.test(url)) {
        throw new Error(`Could not reach ${url} — backend is a separate process.`);
      }

      const routeSource = options.resolveRouteSource(url);
      if (!routeSource) {
        throw new Error(`No route handler registered for ${url}`);
      }

      const routed = await runRouteSource(routeSource, 'GET');
      if (!routed.ok) {
        return {
          ok: false,
          status: 502,
          async json() {
            return { error: routed.error };
          },
        };
      }
      return {
        ok: true,
        status: routed.status,
        async json() {
          return routed.body;
        },
      };
    };

    const prepared = stripExports(source);
    const runner = new Function('fetch', `return (async () => {\n${prepared}\n})();`);
    const body = await runner(fetchMock);
    return {
      ok: true,
      status: 200,
      body,
      meta: options.sameOrigin ? 'page → /api (same app)' : 'page → remote API',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      meta: options.sameOrigin ? 'page → /api' : 'page → remote API',
    };
  }
}
